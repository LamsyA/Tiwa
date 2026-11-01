import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorizeOrg, type OrgAction } from '../auth/org.js';
import type { Actor } from '../auth/authorize.js';
import { loadEventAccess } from '../events/access.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';
import { authorize } from '../auth/authorize.js';
import { checkVenueAvailability } from '../bookings/venue.js';
import { assertQuoteTransition } from './state.js';
import { calcQuoteTotals, quoteItemSchema } from './totals.js';

// Vendor quoting (QTE-02, UF-15): the vendor builds an itemised quote from an
// enquiry (or standalone for venues with instant-book context in T10), sends
// it, or withdraws it. The brief never carries guest contacts, and a vendor
// can only ever read their own org's quotes (UF-15-2).

type UserActor = Extract<Actor, { kind: 'user' }>;

async function loadOrgAccess(actor: UserActor, orgId: string, action: OrgAction) {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: actor.userId } },
    select: { role: true },
  });
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
}

const scheduleEntrySchema = z
  .object({
    label: z.string().trim().min(1, 'scheduleLabelRequired').max(120, 'scheduleLabelTooLong'),
    percentBps: z.number().int().min(1).max(10_000).optional(),
    amountMinor: z.string().regex(/^\d+$/, 'amountInvalid').optional(),
    due: z.string().regex(/^(on_accept|days_before:\d+|date:\d{4}-\d{2}-\d{2})$/, 'scheduleDueInvalid'),
  })
  .refine((entry) => (entry.percentBps === undefined) !== (entry.amountMinor === undefined), {
    message: 'Schedule entries need either a percent or a fixed amount',
  });

export const createQuoteSchema = z.object({
  requestId: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  vendorOrgId: z.string().uuid(),
  spaceId: z.string().uuid().optional(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid').optional(),
  slot: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY']).optional(),
  items: z.array(quoteItemSchema).min(1, 'itemsRequired').max(100, 'itemsTooMany'),
  taxBps: z.number().int().min(0).max(100_000).default(0),
  serviceBps: z.number().int().min(0).max(100_000).default(0),
  travelFeeMinor: z.string().regex(/^\d+$/, 'amountInvalid').default('0'),
  notes: z.string().trim().max(4000, 'notesTooLong').optional(),
  cancellationTerms: z.string().trim().min(1, 'termsRequired').max(4000, 'termsTooLong'),
  proposedSchedule: z.array(scheduleEntrySchema).min(1, 'scheduleRequired').max(10, 'scheduleTooMany'),
  expiresAt: z.string().datetime({ offset: true }),
});

export async function createQuote(actor: UserActor, raw: z.infer<typeof createQuoteSchema>) {
  const input = createQuoteSchema.parse(raw);
  await loadOrgAccess(actor, input.vendorOrgId, 'org.manage');
  const org = await prisma.organization.findUnique({ where: { id: input.vendorOrgId }, select: { kind: true } });
  if (!org || org.kind !== 'VENDOR') throw new ValidationError('Quotes come from vendor businesses', { key: 'notVendor' });

  if (input.requestId) {
    const request = await prisma.quoteRequest.findUnique({ where: { id: input.requestId } });
    if (!request || request.vendorOrgId !== input.vendorOrgId || request.eventId !== input.eventId) {
      throw new NotFoundError('Quote request not found');
    }
    if (request.status !== 'OPEN') throw new ValidationError('This request is no longer open', { key: 'requestClosed' });
  }

  const totals = calcQuoteTotals(input.items, input.taxBps, input.serviceBps, input.travelFeeMinor);
  const expiresAt = new Date(input.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new ValidationError('Expiry must be in the future', { field: 'expiresAt', key: 'expiryPast' });
  }
  const percentSum = input.proposedSchedule.reduce((sum, entry) => sum + (entry.percentBps ?? 0), 0);
  if (percentSum > 10_000) throw new ValidationError('Schedule percents exceed 100%', { key: 'scheduleOver100' });

  const quote = await prisma.quote.create({
    data: {
      requestId: input.requestId ?? null,
      eventId: input.eventId,
      vendorOrgId: input.vendorOrgId,
      spaceId: input.spaceId ?? null,
      serviceDate: input.serviceDate ? new Date(input.serviceDate) : null,
      slot: input.slot ?? null,
      items: input.items,
      taxBps: input.taxBps,
      serviceBps: input.serviceBps,
      travelFeeMinor: BigInt(input.travelFeeMinor),
      subtotalMinor: totals.subtotalMinor,
      totalMinor: totals.totalMinor,
      currency: (await prisma.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { currency: true } })).currency,
      notes: input.notes ?? null,
      cancellationTerms: input.cancellationTerms,
      proposedSchedule: input.proposedSchedule,
      expiresAt,
    },
    select: { id: true, totalMinor: true },
  });
  await audit(prisma, { actor, action: 'quote.create', targetType: 'Quote', targetId: quote.id, data: { eventId: input.eventId, vendorOrgId: input.vendorOrgId } });
  return { quoteId: quote.id, totalMinor: quote.totalMinor.toString() };
}

export const quoteIdSchema = z.object({ quoteId: z.string().uuid() });

export async function sendQuote(actor: UserActor, raw: z.infer<typeof quoteIdSchema>) {
  const { quoteId } = quoteIdSchema.parse(raw);
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  await loadOrgAccess(actor, quote.vendorOrgId, 'org.manage');
  assertQuoteTransition(quote.status, 'SENT');
  if (quote.expiresAt <= new Date()) throw new ValidationError('This quote has expired', { key: 'quoteExpired' });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.quote.update({ where: { id: quoteId }, data: { status: 'SENT', sentAt: new Date() } });
    if (quote.requestId) {
      await tx.quoteRequest.update({ where: { id: quote.requestId }, data: { status: 'QUOTED' } });
    }
    await audit(tx, { actor, action: 'quote.send', targetType: 'Quote', targetId: quoteId, data: { eventId: quote.eventId, vendorOrgId: quote.vendorOrgId } });
    await enqueue(tx, 'quote.sent', { quoteId, eventId: quote.eventId, vendorOrgId: quote.vendorOrgId });
    return { status: updated.status };
  });
}

export async function withdrawQuote(actor: UserActor, raw: z.infer<typeof quoteIdSchema>) {
  const { quoteId } = quoteIdSchema.parse(raw);
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  await loadOrgAccess(actor, quote.vendorOrgId, 'org.manage');
  assertQuoteTransition(quote.status, 'WITHDRAWN');
  const updated = await prisma.quote.update({ where: { id: quoteId }, data: { status: 'WITHDRAWN' } });
  await audit(prisma, { actor, action: 'quote.withdraw', targetType: 'Quote', targetId: quoteId, data: { eventId: quote.eventId } });
  return { status: updated.status };
}

export const updateQuoteSchema = createQuoteSchema
  .omit({ requestId: true, eventId: true, vendorOrgId: true })
  .partial()
  .extend({ quoteId: z.string().uuid() });

/**
 * Vendor revises a quote that was never decided (DRAFT or CHANGES_REQUESTED):
 * items re-total on the server, and venue date/space/slot moves re-check
 * availability. Sent quotes are immutable — request changes first.
 */
export async function updateQuote(actor: UserActor, raw: z.infer<typeof updateQuoteSchema>) {
  const { quoteId, ...patch } = updateQuoteSchema.parse(raw);
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  await loadOrgAccess(actor, quote.vendorOrgId, 'org.manage');
  if (quote.status !== 'DRAFT' && quote.status !== 'CHANGES_REQUESTED') {
    throw new ValidationError('Only an unsent quote can be edited', { key: 'quoteLocked' });
  }

  const items = patch.items ?? (quote.items as unknown as { name: string; qty: number; unitMinor: string }[]);
  const totals = calcQuoteTotals(
    items,
    patch.taxBps ?? quote.taxBps,
    patch.serviceBps ?? quote.serviceBps,
    patch.travelFeeMinor ?? quote.travelFeeMinor.toString(),
  );
  let percentSum = 0;
  const schedule = patch.proposedSchedule ?? (quote.proposedSchedule as unknown as { label: string; percentBps?: number }[]);
  for (const entry of schedule) percentSum += entry.percentBps ?? 0;
  if (percentSum > 10_000) throw new ValidationError('Schedule percents exceed 100%', { key: 'scheduleOver100' });

  const spaceId = patch.spaceId ?? quote.spaceId;
  const serviceDate = patch.serviceDate ? new Date(patch.serviceDate) : quote.serviceDate;
  const slot = patch.slot ?? quote.slot;
  if ((spaceId || serviceDate || slot) && (patch.spaceId !== undefined || patch.serviceDate !== undefined || patch.slot !== undefined)) {
    const space = spaceId
      ? await prisma.venueSpace.findFirst({ where: { id: spaceId, profile: { orgId: quote.vendorOrgId } }, select: { id: true } })
      : null;
    if (spaceId && !space) throw new NotFoundError('Space not found');
    if (serviceDate && slot) {
      await checkVenueAvailability(prisma, { vendorOrgId: quote.vendorOrgId, spaceId, date: serviceDate, slot });
    }
  }
  if (patch.expiresAt) {
    const expiresAt = new Date(patch.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw new ValidationError('Expiry must be in the future', { field: 'expiresAt', key: 'expiryPast' });
    }
  }

  const updated = await prisma.quote.update({
    where: { id: quoteId },
    data: {
      ...(patch.items ? { items: patch.items } : {}),
      ...(patch.taxBps !== undefined ? { taxBps: patch.taxBps } : {}),
      ...(patch.serviceBps !== undefined ? { serviceBps: patch.serviceBps } : {}),
      ...(patch.travelFeeMinor !== undefined ? { travelFeeMinor: BigInt(patch.travelFeeMinor) } : {}),
      subtotalMinor: totals.subtotalMinor,
      totalMinor: totals.totalMinor,
      ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
      ...(patch.cancellationTerms ? { cancellationTerms: patch.cancellationTerms } : {}),
      ...(patch.proposedSchedule ? { proposedSchedule: patch.proposedSchedule } : {}),
      ...(patch.expiresAt ? { expiresAt: new Date(patch.expiresAt) } : {}),
      ...(patch.spaceId !== undefined ? { spaceId: patch.spaceId ?? null } : {}),
      ...(patch.serviceDate !== undefined ? { serviceDate: patch.serviceDate ? new Date(patch.serviceDate) : null } : {}),
      ...(patch.slot !== undefined ? { slot: patch.slot ?? null } : {}),
    },
    select: { id: true, totalMinor: true },
  });
  await audit(prisma, { actor, action: 'quote.update', targetType: 'Quote', targetId: quoteId, data: { eventId: quote.eventId, vendorOrgId: quote.vendorOrgId } });
  return { quoteId: updated.id, totalMinor: updated.totalMinor.toString() };
}

/** Vendor declines the enquiry itself (no quote). */
export async function declineEnquiry(actor: UserActor, raw: unknown) {
  const { requestId } = z.object({ requestId: z.string().uuid() }).parse(raw);
  const request = await prisma.quoteRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Quote request not found');
  await loadOrgAccess(actor, request.vendorOrgId, 'org.manage');
  if (request.status !== 'OPEN') throw new ValidationError('This request is no longer open', { key: 'requestClosed' });
  await prisma.quoteRequest.update({ where: { id: requestId }, data: { status: 'DECLINED_BY_VENDOR' } });
  await audit(prisma, { actor, action: 'quote.declineEnquiry', targetType: 'QuoteRequest', targetId: requestId, data: { eventId: request.eventId } });
  return { status: 'DECLINED_BY_VENDOR' as const };
}

/**
 * Read one quote with vendor isolation (UF-15-2): the vendor's own team via
 * org membership, otherwise host-side roles on the event. Vendor and
 * photographer participants never see another vendor's quote.
 */
export async function getQuote(actor: UserActor, raw: z.infer<typeof quoteIdSchema>) {
  const { quoteId } = quoteIdSchema.parse(raw);
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: quote.vendorOrgId, userId: actor.userId } },
    select: { role: true },
  });
  if (membership) return toQuoteView(quote);
  const access = await loadEventAccess(actor.userId, quote.eventId);
  if (!access) throw new NotFoundError('Quote not found');
  if (access.role === 'VENDOR' || access.role === 'PHOTOGRAPHER') throw new NotFoundError('Quote not found');
  authorize(actor, 'event.view', { eventId: quote.eventId, access });
  return toQuoteView(quote);
}

function toQuoteView(quote: {
  id: string;
  eventId: string;
  vendorOrgId: string;
  status: string;
  items: unknown;
  taxBps: number;
  serviceBps: number;
  travelFeeMinor: bigint;
  subtotalMinor: bigint;
  totalMinor: bigint;
  currency: string;
  expiresAt: Date;
}) {
  return {
    ...quote,
    travelFeeMinor: quote.travelFeeMinor.toString(),
    subtotalMinor: quote.subtotalMinor.toString(),
    totalMinor: quote.totalMinor.toString(),
  };
}

/** Vendor team inbox (VND-01): open enquiries for every vendor org the actor belongs to. */
export async function listEnquiries(actor: UserActor) {
  const memberships = await prisma.membership.findMany({
    where: { userId: actor.userId, org: { kind: 'VENDOR', deletedAt: null } },
    select: { orgId: true },
  });
  if (memberships.length === 0) throw new ForbiddenError('Only vendor teams have an enquiries inbox');
  const orgIds = memberships.map((membership) => membership.orgId);
  const requests = await prisma.quoteRequest.findMany({
    where: { vendorOrgId: { in: orgIds }, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      eventId: true,
      category: true,
      vendorOrgId: true,
      brief: true,
      status: true,
      createdAt: true,
      event: { select: { name: true, type: true, startsAt: true, timezone: true, expectedGuests: true, currency: true } },
    },
  });
  const quoteCounts = await prisma.quote.groupBy({ by: ['requestId'], where: { requestId: { in: requests.map((row) => row.id) } }, _count: true });
  const counts = new Map(quoteCounts.map((row) => [row.requestId, row._count]));
  return requests.map((row) => ({ ...row, draftQuotes: row.id ? (counts.get(row.id) ?? 0) : 0 }));
}

/** One enquiry with its brief and the vendor's drafts (quote builder page). */
export async function getEnquiry(actor: UserActor, raw: unknown) {
  const { requestId } = z.object({ requestId: z.string().uuid() }).parse(raw);
  const request = await prisma.quoteRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Quote request not found');
  await loadOrgAccess(actor, request.vendorOrgId, 'org.manage');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: request.eventId },
    select: { name: true, type: true, startsAt: true, endsAt: true, timezone: true, expectedGuests: true, currency: true },
  });
  const quotes = await prisma.quote.findMany({
    where: { requestId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, totalMinor: true, currency: true, expiresAt: true },
  });
  return {
    request: { id: request.id, eventId: request.eventId, category: request.category, vendorOrgId: request.vendorOrgId, brief: request.brief, status: request.status },
    event,
    quotes: quotes.map((quote) => ({ ...quote, totalMinor: quote.totalMinor.toString() })),
  };
}

/** Quotes past expiry in a sendable state (job flips them to EXPIRED). */
export async function findExpiredQuotes(now = new Date()) {
  return prisma.quote.findMany({
    where: { expiresAt: { lt: now }, status: { in: ['DRAFT', 'SENT', 'CHANGES_REQUESTED'] } },
    select: { id: true, eventId: true, vendorOrgId: true },
  });
}

export async function expireQuotes(now = new Date()) {
  const due = await findExpiredQuotes(now);
  let expired = 0;
  for (const quote of due) {
    const updated = await prisma.quote.updateMany({ where: { id: quote.id, status: { in: ['DRAFT', 'SENT', 'CHANGES_REQUESTED'] } }, data: { status: 'EXPIRED' } });
    if (updated.count === 0) continue;
    expired += 1;
    await audit(prisma, {
      actor: { kind: 'system' },
      action: 'quote.expire',
      targetType: 'Quote',
      targetId: quote.id,
      data: { eventId: quote.eventId, vendorOrgId: quote.vendorOrgId },
    });
    await enqueue(prisma, 'quote.expired', { quoteId: quote.id, eventId: quote.eventId, vendorOrgId: quote.vendorOrgId });
  }
  return { expired };
}
