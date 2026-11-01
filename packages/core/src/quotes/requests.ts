import { VENDOR_CATEGORIES } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { requireEventAccess } from '../events/access.js';
import type { Actor } from '../auth/authorize.js';
import { ConflictError, LimitReachedError, ValidationError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';

// Quote requests (QTE-01, UF-14): host/planner asks up to 5 vendors in one
// category per event for a quote. The brief is prefilled from the event so
// vendors get date, venue, headcount and budget context without guest
// contacts (vendor isolation: brief never carries phones or emails).

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
  if (!(input.category in VENDOR_CATEGORIES)) {
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
    if (!org || org.kind !== 'VENDOR' || !org.profile?.published || !org.profile.categories.includes(input.category)) {
      throw new ValidationError('Vendor cannot receive this request', { field: 'vendorOrgIds', key: 'vendorIneligible' });
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
      const row = await tx.quoteRequest.create({
        data: { eventId: input.eventId, category: input.category, vendorOrgId, brief, createdById: actor.userId },
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
