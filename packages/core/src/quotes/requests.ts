import { isQuoteCategory, PLANNING_CATEGORY } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { requireEventAccess } from '../events/access.js';
import type { Actor } from '../auth/authorize.js';
import { ConflictError, LimitReachedError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';
import { ensurePlannerClient } from '../planner/pipeline-sync.js';

// Quote requests (QTE-01, UF-14): host/planner asks up to 5 vendors in one
// category per event for a quote. The brief is prefilled from the event so
// vendors get date, venue, headcount and budget context without guest
// contacts (vendor isolation: brief never carries phones or emails).
// D-X64: the reserved `planning` category asks planner orgs for a proposal
// through the same pipeline; every other category goes to vendor orgs only.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const MAX_VENDORS_PER_CATEGORY = 5;

export const requestQuotesSchema = z.object({
  eventId: z.string().uuid(),
  category: z.string().min(1, 'categoryRequired').max(60, 'categoryTooLong'),
  vendorOrgIds: z.array(z.string().uuid()).min(1, 'vendorsRequired').max(MAX_VENDORS_PER_CATEGORY, 'tooManyVendors'),
  notes: z.string().trim().max(2000, 'notesTooLong').optional(),
  budgetMaxMinor: z.string().regex(/^\d+$/, 'amountInvalid').optional(),
});

export interface QuoteBriefPrefill {
  eventName: string;
  eventType: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  venue: string | null;
  expectedGuests: number | null;
  currency: string;
}

/** Server-built brief context: everything the vendor needs, nothing they must not see. */
export async function buildQuoteBrief(eventId: string): Promise<QuoteBriefPrefill> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: {
      name: true,
      type: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      expectedGuests: true,
      currency: true,
      days: { orderBy: { date: 'asc' }, take: 1, select: { venueName: true, address: true } },
    },
  });
  const day = event.days[0];
  const venue = day ? [day.venueName, day.address].filter(Boolean).join(', ') || null : null;
  return {
    eventName: event.name,
    eventType: event.type,
    startsAt: event.startsAt?.toISOString() ?? null,
    endsAt: event.endsAt?.toISOString() ?? null,
    timezone: event.timezone,
    venue,
    expectedGuests: event.expectedGuests,
    currency: event.currency,
  };
}

export async function requestQuotes(actor: UserActor, raw: z.infer<typeof requestQuotesSchema>) {
  const input = requestQuotesSchema.parse(raw);
  if (!isQuoteCategory(input.category)) {
    throw new ValidationError('Unknown vendor category', { field: 'category', key: 'categoryUnknown' });
  }
  await requireEventAccess(actor, input.eventId, 'event.edit');

  const uniqueVendorIds = [...new Set(input.vendorOrgIds)];
  if (uniqueVendorIds.length !== input.vendorOrgIds.length) {
    throw new ValidationError('Duplicate vendors in request', { field: 'vendorOrgIds', key: 'vendorsDuplicate' });
  }

  const openCount = await prisma.quoteRequest.count({
    where: { eventId: input.eventId, category: input.category, status: 'OPEN' },
  });
  const alreadyAsked = await prisma.quoteRequest.findFirst({
    where: { eventId: input.eventId, category: input.category, vendorOrgId: { in: uniqueVendorIds } },
    select: { vendorOrgId: true },
  });
  if (alreadyAsked) {
    throw new ConflictError('This vendor was already asked for this category', {
      vendorOrgId: alreadyAsked.vendorOrgId,
    });
  }
  if (openCount + uniqueVendorIds.length > MAX_VENDORS_PER_CATEGORY) {
    throw new LimitReachedError(
      `Quote request is limited to ${MAX_VENDORS_PER_CATEGORY} vendors per category per event at once`,
      { openCount, requested: uniqueVendorIds.length },
    );
  }

  const orgs = await prisma.organization.findMany({
    where: { id: { in: uniqueVendorIds }, deletedAt: null },
    select: { id: true, kind: true, profile: { select: { published: true, categories: true } } },
  });
  const byId = new Map(orgs.map((org) => [org.id, org]));
  for (const vendorOrgId of uniqueVendorIds) {
    const org = byId.get(vendorOrgId);
    // A vendor who hasn't picked categories yet (they can publish early, D-X34)
    // can be asked for any service; otherwise the request must match one.
    const planning = input.category === PLANNING_CATEGORY;
    const offers = org?.profile?.categories ?? [];
    if (
      !org ||
      org.kind !== (planning ? 'PLANNER' : 'VENDOR') ||
      !org.profile?.published ||
      (!planning && offers.length > 0 && !offers.includes(input.category))
    ) {
      throw new ValidationError('Vendor cannot receive this request', {
        field: 'vendorOrgIds',
        key: 'vendorIneligible',
      });
    }
  }

  const prefill = await buildQuoteBrief(input.eventId);
  const brief = {
    ...prefill,
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.budgetMaxMinor ? { budgetMaxMinor: input.budgetMaxMinor } : {}),
  };

  return prisma.$transaction(async (tx) => {
    const created: { id: string; vendorOrgId: string }[] = [];
    for (const vendorOrgId of uniqueVendorIds) {
      const existing = await tx.quoteRequest.findUnique({
        where: { eventId_category_vendorOrgId: { eventId: input.eventId, category: input.category, vendorOrgId } },
        select: { id: true, status: true },
      });
      if (existing) throw new ConflictError('This vendor was already asked for this category', { vendorOrgId });
      // D-X69: a planning request lands the host in that planner's pipeline.
      const clientId =
        input.category === PLANNING_CATEGORY
          ? await ensurePlannerClient(tx, { orgId: vendorOrgId, hostUserId: actor.userId })
          : null;
      const row = await tx.quoteRequest.create({
        data: {
          eventId: input.eventId,
          category: input.category,
          vendorOrgId,
          brief,
          createdById: actor.userId,
          clientId,
        },
        select: { id: true, vendorOrgId: true },
      });
      created.push(row);
      await audit(tx, {
        actor,
        action: 'quote.request',
        targetType: 'QuoteRequest',
        targetId: row.id,
        data: { eventId: input.eventId, category: input.category, vendorOrgId },
      });
      await enqueue(tx, 'quote.requested', {
        quoteRequestId: row.id,
        eventId: input.eventId,
        vendorOrgId,
        category: input.category,
      });
    }
    return { requests: created, brief: prefill };
  });
}

export const listEventQuoteRequestsSchema = z.object({ eventId: z.string().uuid() });

/** Host/planner view of every request on the event (quoting state per category). */
export async function listEventQuoteRequests(actor: UserActor, input: z.infer<typeof listEventQuoteRequestsSchema>) {
  const { eventId } = listEventQuoteRequestsSchema.parse(input);
  await requireEventAccess(actor, eventId, 'event.view');
  return prisma.quoteRequest.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, category: true, vendorOrgId: true, status: true, createdAt: true },
  });
}

export const proposalFromChatSchema = z.object({ threadId: z.string().uuid() });

/**
 * D-X101: chat first, then a proposal. A planner who has been talking with a
 * host about an event opens a proposal straight from that conversation: Tiwa
 * creates the planning request on the host's behalf (or reuses the one that
 * exists) so the planner writes whatever scope they agreed — no fixed scope
 * picked upfront. Returns the request the planner's proposal editor opens.
 */
export async function proposalFromChat(
  actor: UserActor,
  raw: z.input<typeof proposalFromChatSchema>,
): Promise<{ requestId: string; created: boolean }> {
  const input = proposalFromChatSchema.parse(raw);
  const thread = await prisma.thread.findUnique({
    where: { id: input.threadId },
    select: {
      kind: true,
      eventId: true,
      participants: { where: { leftAt: null }, select: { userId: true, orgId: true, side: true } },
    },
  });
  if (!thread || thread.kind !== 'DIRECT') throw new NotFoundError('Conversation not found');
  if (!thread.eventId) {
    throw new ValidationError('Ask the host which event this is for first', { key: 'noEventInChat' });
  }
  const memberships = await prisma.membership.findMany({
    where: { userId: actor.userId, role: { in: ['OWNER', 'ADMIN'] }, org: { kind: 'PLANNER', deletedAt: null } },
    select: { orgId: true },
  });
  const plannerOrgId = thread.participants.find((p) => p.orgId && memberships.some((m) => m.orgId === p.orgId))?.orgId;
  if (!plannerOrgId) throw new NotFoundError('Conversation not found');
  const eventId = thread.eventId;
  // The host side of the chat: a person (not a business) with host rights on the event.
  const people = thread.participants.filter((p) => p.userId && !p.orgId).map((p) => p.userId as string);
  const hostSeat = await prisma.eventParticipant.findFirst({
    where: { eventId, userId: { in: people }, role: { in: ['HOST', 'CO_HOST'] }, removedAt: null },
    select: { userId: true },
  });
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { createdById: true } });
  const hostUserId = hostSeat?.userId ?? (event && people.includes(event.createdById) ? event.createdById : null);
  if (!hostUserId) throw new NotFoundError('Conversation not found');

  const existing = await prisma.quoteRequest.findUnique({
    where: { eventId_category_vendorOrgId: { eventId, category: PLANNING_CATEGORY, vendorOrgId: plannerOrgId } },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === 'DECLINED_BY_VENDOR' || existing.status === 'CLOSED') {
      await prisma.quoteRequest.update({ where: { id: existing.id }, data: { status: 'OPEN' } });
    }
    return { requestId: existing.id, created: false };
  }
  const prefill = await buildQuoteBrief(eventId);
  return prisma.$transaction(async (tx) => {
    const clientId = await ensurePlannerClient(tx, { orgId: plannerOrgId, hostUserId });
    const row = await tx.quoteRequest.create({
      data: {
        eventId,
        category: PLANNING_CATEGORY,
        vendorOrgId: plannerOrgId,
        brief: { ...prefill, notes: 'Scope agreed in chat. See your conversation.', fromThreadId: input.threadId },
        createdById: hostUserId,
        clientId,
      },
      select: { id: true },
    });
    await audit(tx, {
      actor,
      action: 'quote.request.fromChat',
      targetType: 'QuoteRequest',
      targetId: row.id,
      data: { eventId, vendorOrgId: plannerOrgId, threadId: input.threadId },
    });
    return { requestId: row.id, created: true };
  });
}
