import { PLANNING_CATEGORY } from '@tiwa/config';
import { prisma, Prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorizeOrg, type OrgAction } from '../auth/org.js';
import type { Actor } from '../auth/authorize.js';
import { loadEventAccess } from '../events/access.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';
import { syncPipelineForRequest } from '../planner/pipeline-sync.js';
import { authorize } from '../auth/authorize.js';
import { pricesHiddenFor, priceVisibilityFor, redactQuote } from '../events/prices.js';
import { checkVenueAvailability } from '../bookings/venue.js';
import { mirrorToEventTeam, postCard, postDecision } from '../chat/cards.js';
import { notify } from '../messaging/notify.js';
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
  serviceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid')
    .optional(),
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
  if (!org || (org.kind !== 'VENDOR' && org.kind !== 'PLANNER'))
    throw new ValidationError('Quotes come from vendor businesses', { key: 'notVendor' });
  // D-X64: a planner only answers a planning request, as a proposal.
  if (org.kind === 'PLANNER') {
    const request = input.requestId
      ? await prisma.quoteRequest.findUnique({ where: { id: input.requestId }, select: { category: true } })
      : null;
    if (request?.category !== PLANNING_CATEGORY)
      throw new ValidationError('Planners send proposals in reply to a request', { key: 'notVendor' });
  }

  if (input.requestId) {
    const request = await prisma.quoteRequest.findUnique({ where: { id: input.requestId } });
    if (!request || request.vendorOrgId !== input.vendorOrgId || request.eventId !== input.eventId) {
      throw new NotFoundError('Quote request not found');
    }
    if (request.status !== 'OPEN')
      throw new ValidationError('This request is no longer open', { key: 'requestClosed' });
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
      currency: (await prisma.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { currency: true } }))
        .currency,
      notes: input.notes ?? null,
      cancellationTerms: input.cancellationTerms,
      proposedSchedule: input.proposedSchedule,
      expiresAt,
    },
    select: { id: true, totalMinor: true },
  });
  await audit(prisma, {
    actor,
    action: 'quote.create',
    targetType: 'Quote',
    targetId: quote.id,
    data: { eventId: input.eventId, vendorOrgId: input.vendorOrgId },
  });
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

  return prisma
    .$transaction(async (tx) => {
      // A resend after a change request is a new revision (D-X66).
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          ...(quote.status === 'CHANGES_REQUESTED' ? { revision: { increment: 1 } } : {}),
        },
      });
      if (quote.requestId) {
        await tx.quoteRequest.update({ where: { id: quote.requestId }, data: { status: 'QUOTED' } });
      }
      await syncPipelineForRequest(tx, quote.requestId, 'PROPOSAL_SENT');
      // D-X67: freeze this version for the history both sides can review later.
      await tx.quoteRevision.upsert({
        where: { quoteId_revision: { quoteId, revision: updated.revision } },
        create: {
          quoteId,
          revision: updated.revision,
          items: updated.items as Prisma.InputJsonValue,
          taxBps: updated.taxBps,
          serviceBps: updated.serviceBps,
          travelFeeMinor: updated.travelFeeMinor,
          subtotalMinor: updated.subtotalMinor,
          totalMinor: updated.totalMinor,
          currency: updated.currency,
          notes: updated.notes,
          cancellationTerms: updated.cancellationTerms,
          proposedSchedule: updated.proposedSchedule as Prisma.InputJsonValue,
          expiresAt: updated.expiresAt,
          sentAt: updated.sentAt ?? new Date(),
          sentById: actor.userId,
        },
        update: {},
      });
      await audit(tx, {
        actor,
        action: 'quote.send',
        targetType: 'Quote',
        targetId: quoteId,
        data: { eventId: quote.eventId, vendorOrgId: quote.vendorOrgId },
      });
      await enqueue(tx, 'quote.sent', {
        quoteId,
        eventId: quote.eventId,
        vendorOrgId: quote.vendorOrgId,
        revised: quote.status === 'CHANGES_REQUESTED',
      });
      return { status: updated.status };
    })
    .then(async (result) => {
      try {
        const vendor = await prisma.organization.findUnique({
          where: { id: quote.vendorOrgId },
          select: { name: true },
        });
        await mirrorToEventTeam(actor, quote.eventId, 'quote', quoteId, {
          vendorName: vendor?.name ?? '',
          totalMinor: quote.totalMinor.toString(),
          currency: quote.currency,
        });
        // D-X101: a proposal that grew out of a chat lands back in that chat.
        if (quote.requestId) {
          const request = await prisma.quoteRequest.findUnique({
            where: { id: quote.requestId },
            select: { brief: true },
          });
          const threadId = (request?.brief as { fromThreadId?: unknown } | null)?.fromThreadId;
          if (typeof threadId === 'string') {
            await postCard(actor, {
              threadId,
              type: 'quote',
              refId: quoteId,
              snapshot: {
                vendorName: vendor?.name ?? '',
                totalMinor: quote.totalMinor.toString(),
                currency: quote.currency,
                href: `/events/${quote.eventId}/vendors/${PLANNING_CATEGORY}`,
              },
            });
          }
        }
      } catch {
        // Best-effort mirror; the send already succeeded.
      }
      return result;
    });
}

export async function withdrawQuote(actor: UserActor, raw: z.infer<typeof quoteIdSchema>) {
  const { quoteId } = quoteIdSchema.parse(raw);
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  await loadOrgAccess(actor, quote.vendorOrgId, 'org.manage');
  assertQuoteTransition(quote.status, 'WITHDRAWN');
  const updated = await prisma.quote.update({ where: { id: quoteId }, data: { status: 'WITHDRAWN' } });
  await audit(prisma, {
    actor,
    action: 'quote.withdraw',
    targetType: 'Quote',
    targetId: quoteId,
    data: { eventId: quote.eventId },
  });
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
  const schedule =
    patch.proposedSchedule ?? (quote.proposedSchedule as unknown as { label: string; percentBps?: number }[]);
  for (const entry of schedule) percentSum += entry.percentBps ?? 0;
  if (percentSum > 10_000) throw new ValidationError('Schedule percents exceed 100%', { key: 'scheduleOver100' });

  const spaceId = patch.spaceId ?? quote.spaceId;
  const serviceDate = patch.serviceDate ? new Date(patch.serviceDate) : quote.serviceDate;
  const slot = patch.slot ?? quote.slot;
  if (
    (spaceId || serviceDate || slot) &&
    (patch.spaceId !== undefined || patch.serviceDate !== undefined || patch.slot !== undefined)
  ) {
    const space = spaceId
      ? await prisma.venueSpace.findFirst({
          where: { id: spaceId, profile: { orgId: quote.vendorOrgId } },
          select: { id: true },
        })
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
      ...(patch.serviceDate !== undefined
        ? { serviceDate: patch.serviceDate ? new Date(patch.serviceDate) : null }
        : {}),
      ...(patch.slot !== undefined ? { slot: patch.slot ?? null } : {}),
    },
    select: { id: true, totalMinor: true },
  });
  await audit(prisma, {
    actor,
    action: 'quote.update',
    targetType: 'Quote',
    targetId: quoteId,
    data: { eventId: quote.eventId, vendorOrgId: quote.vendorOrgId },
  });
  return { quoteId: updated.id, totalMinor: updated.totalMinor.toString() };
}

/** Vendor declines the enquiry itself (no quote). */
export async function declineEnquiry(actor: UserActor, raw: unknown) {
  const { requestId } = z.object({ requestId: z.string().uuid() }).parse(raw);
  const request = await prisma.quoteRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Quote request not found');
  await loadOrgAccess(actor, request.vendorOrgId, 'org.manage');
  if (request.status !== 'OPEN') throw new ValidationError('This request is no longer open', { key: 'requestClosed' });
  await prisma.$transaction(async (tx) => {
    await tx.quoteRequest.update({ where: { id: requestId }, data: { status: 'DECLINED_BY_VENDOR' } });
    await syncPipelineForRequest(tx, requestId, 'LOST');
  });
  await audit(prisma, {
    actor,
    action: 'quote.declineEnquiry',
    targetType: 'QuoteRequest',
    targetId: requestId,
    data: { eventId: request.eventId },
  });
  // Tell the host (D-X102): the request leaves their list, so say why.
  const org = await prisma.organization.findUnique({
    where: { id: request.vendorOrgId },
    select: { name: true, kind: true },
  });
  const what = org?.kind === 'PLANNER' ? 'proposal request' : 'quote request';
  await notify(
    { kind: 'system' },
    {
      userId: request.createdById,
      type: 'quote.requestDeclined',
      title: `${org?.name ?? 'A business'} declined your ${what}`,
      body: 'They can’t take this one. Browse others on Tiwa and send a new request.',
      url: `/events/${request.eventId}/vendors/${request.category}`,
      data: { requestId, eventId: request.eventId },
    },
  ).catch(() => undefined);
  await postDecision(actor, {
    eventId: request.eventId,
    orgId: request.vendorOrgId,
    refId: requestId,
    snapshot: { decision: 'declined', subject: 'request', vendorName: org?.name ?? '' },
  });
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
  const row = toQuoteView(quote);
  if (pricesHiddenFor(access, await priceVisibilityFor(quote.eventId))) return redactQuote(row);
  return row;
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

/** Vendor team inbox (VND-01): open enquiries for every vendor or planner org the actor belongs to (D-X64). */
export async function listEnquiries(actor: UserActor) {
  const memberships = await prisma.membership.findMany({
    where: { userId: actor.userId, org: { kind: { in: ['VENDOR', 'PLANNER'] }, deletedAt: null } },
    select: { orgId: true },
  });
  if (memberships.length === 0) throw new ForbiddenError('Only business teams have an enquiries inbox');
  const orgIds = memberships.map((membership) => membership.orgId);
  // Open requests, plus answered ones the client sent back for changes (D-X66).
  const sentBack = await prisma.quote.findMany({
    where: { vendorOrgId: { in: orgIds }, status: 'CHANGES_REQUESTED', requestId: { not: null } },
    select: { requestId: true },
  });
  const sentBackIds = sentBack.map((row) => row.requestId as string);
  const requests = await prisma.quoteRequest.findMany({
    where: {
      vendorOrgId: { in: orgIds },
      OR: [{ status: 'OPEN' }, { id: { in: sentBackIds } }],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      eventId: true,
      category: true,
      vendorOrgId: true,
      brief: true,
      status: true,
      createdAt: true,
      event: {
        select: { name: true, type: true, startsAt: true, timezone: true, expectedGuests: true, currency: true },
      },
    },
  });
  const quoteCounts = await prisma.quote.groupBy({
    by: ['requestId'],
    where: { requestId: { in: requests.map((row) => row.id) } },
    _count: true,
  });
  const counts = new Map(quoteCounts.map((row) => [row.requestId, row._count]));
  const pending = await prisma.quote.findMany({
    where: { requestId: { in: requests.map((row) => row.id) }, status: 'CHANGES_REQUESTED' },
    select: { requestId: true, changeRequest: true, changeRequestedAt: true },
  });
  const changes = new Map(pending.map((row) => [row.requestId, row]));
  return requests
    .map((row) => {
      const change = changes.get(row.id);
      return {
        ...row,
        draftQuotes: row.id ? (counts.get(row.id) ?? 0) : 0,
        changeRequest: change ? { message: change.changeRequest, at: change.changeRequestedAt } : null,
      };
    })
    .sort((a, b) => Number(Boolean(b.changeRequest)) - Number(Boolean(a.changeRequest)));
}

/** One enquiry with its brief and the vendor's drafts (quote builder page). */
export async function getEnquiry(actor: UserActor, raw: unknown) {
  const { requestId } = z.object({ requestId: z.string().uuid() }).parse(raw);
  const request = await prisma.quoteRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Quote request not found');
  await loadOrgAccess(actor, request.vendorOrgId, 'org.manage');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: request.eventId },
    select: {
      name: true,
      type: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      expectedGuests: true,
      currency: true,
    },
  });
  const quotes = await prisma.quote.findMany({
    where: { requestId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      totalMinor: true,
      currency: true,
      expiresAt: true,
      items: true,
      taxBps: true,
      serviceBps: true,
      travelFeeMinor: true,
      notes: true,
      cancellationTerms: true,
      proposedSchedule: true,
      changeRequest: true,
      changeRequestedAt: true,
      revision: true,
    },
  });
  return {
    request: {
      id: request.id,
      eventId: request.eventId,
      category: request.category,
      vendorOrgId: request.vendorOrgId,
      brief: request.brief,
      status: request.status,
    },
    event,
    quotes: quotes.map((quote) => ({
      ...quote,
      totalMinor: quote.totalMinor.toString(),
      travelFeeMinor: quote.travelFeeMinor.toString(),
      changeRequestedAt: quote.changeRequestedAt?.toISOString() ?? null,
    })),
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
    const updated = await prisma.quote.updateMany({
      where: { id: quote.id, status: { in: ['DRAFT', 'SENT', 'CHANGES_REQUESTED'] } },
      data: { status: 'EXPIRED' },
    });
    if (updated.count === 0) continue;
    expired += 1;
    await audit(prisma, {
      actor: { kind: 'system' },
      action: 'quote.expire',
      targetType: 'Quote',
      targetId: quote.id,
      data: { eventId: quote.eventId, vendorOrgId: quote.vendorOrgId },
    });
    await enqueue(prisma, 'quote.expired', {
      quoteId: quote.id,
      eventId: quote.eventId,
      vendorOrgId: quote.vendorOrgId,
    });
  }
  return { expired };
}
