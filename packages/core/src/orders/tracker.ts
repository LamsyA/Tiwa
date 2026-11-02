import { VENDOR_CATEGORIES } from '@tiwa/config';
import { prisma, type BookingStatus, type QuoteStatus } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { NotFoundError } from '../shared/errors.js';

// Order tracking (D-X35): one view of every enquiry → quote → booking, for
// both sides. A vendor sees its clients' orders; a host or planner sees the
// orders across the events they run. Each order sits in exactly one stage.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const ORDER_STAGES = ['requested', 'quoted', 'booked', 'confirmed', 'delivered', 'completed', 'closed'] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export interface OrderRow {
  /** Stable key: the booking, else the quote, else the request. */
  id: string;
  stage: OrderStage;
  /** Raw status for the badge (request, quote or booking status). */
  status: string;
  eventId: string;
  eventName: string;
  /** The other party: the client for a vendor, the business for a host/planner. */
  counterparty: string;
  category: string;
  /** Raw category key (links to /events/[id]/vendors/[category]). */
  categoryKey: string;
  date: string | null;
  amountMinor: string | null;
  currency: string | null;
  requestId: string | null;
  bookingId: string | null;
  vendorOrgId: string;
  updatedAt: string;
}

export function stageForBooking(status: BookingStatus): OrderStage {
  switch (status) {
    case 'ACCEPTED':
    case 'DEPOSIT_DUE':
      return 'booked';
    case 'CONFIRMED':
    case 'IN_PROGRESS':
      return 'confirmed';
    case 'DELIVERED':
    case 'DISPUTED':
      return 'delivered';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'closed';
  }
}

export function stageForQuote(status: QuoteStatus): OrderStage {
  if (status === 'SENT' || status === 'CHANGES_REQUESTED') return 'quoted';
  if (status === 'DRAFT') return 'requested';
  return 'closed';
}

const label = (key: string) => VENDOR_CATEGORIES[key as keyof typeof VENDOR_CATEGORIES] ?? key;
const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);
const RECENT_MS = 60 * 86_400_000;

/** Build rows from requests, quotes and bookings, keeping only the furthest step of each order. */
async function buildOrders(
  where: { vendorOrgId: string } | { eventId: { in: string[] } },
  side: 'vendor' | 'client',
  now: Date,
): Promise<OrderRow[]> {
  const since = new Date(now.getTime() - RECENT_MS);
  const [requests, quotes, bookings] = await Promise.all([
    prisma.quoteRequest.findMany({
      where: { ...where, OR: [{ status: 'OPEN' }, { createdAt: { gte: since } }] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        status: true,
        category: true,
        vendorOrgId: true,
        createdAt: true,
        event: { select: { id: true, name: true, startsAt: true, createdBy: { select: { name: true } } } },
      },
    }),
    prisma.quote.findMany({
      where: {
        ...where,
        status: { notIn: ['DRAFT'] },
        OR: [{ status: { in: ['SENT', 'CHANGES_REQUESTED'] } }, { createdAt: { gte: since } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        requestId: true,
        status: true,
        vendorOrgId: true,
        serviceDate: true,
        totalMinor: true,
        currency: true,
        sentAt: true,
        createdAt: true,
        event: { select: { id: true, name: true, startsAt: true, createdBy: { select: { name: true } } } },
      },
    }),
    prisma.booking.findMany({
      where: {
        ...where,
        OR: [{ status: { notIn: ['COMPLETED', 'CANCELLED'] } }, { createdAt: { gte: since } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        quoteId: true,
        status: true,
        category: true,
        vendorOrgId: true,
        serviceDate: true,
        totalMinor: true,
        currency: true,
        createdAt: true,
        event: { select: { id: true, name: true, startsAt: true, createdBy: { select: { name: true } } } },
      },
    }),
  ]);

  const orgIds = [...new Set([...requests, ...quotes, ...bookings].map((row) => row.vendorOrgId))];
  const orgs =
    side === 'client'
      ? new Map(
          (await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })).map(
            (org) => [org.id, org.name],
          ),
        )
      : new Map<string, string>();
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const party = (row: { vendorOrgId: string; event: { createdBy: { name: string } } }) =>
    side === 'vendor' ? row.event.createdBy.name : (orgs.get(row.vendorOrgId) ?? '');

  const rows: OrderRow[] = [];
  const seenQuotes = new Set<string>();
  const seenRequests = new Set<string>();

  for (const booking of bookings) {
    const quote = booking.quoteId ? quoteById.get(booking.quoteId) : undefined;
    if (booking.quoteId) seenQuotes.add(booking.quoteId);
    if (quote?.requestId) seenRequests.add(quote.requestId);
    rows.push({
      id: booking.id,
      stage: stageForBooking(booking.status),
      status: booking.status,
      eventId: booking.event.id,
      eventName: booking.event.name,
      counterparty: party(booking),
      category: label(booking.category),
      categoryKey: booking.category,
      date: iso(booking.serviceDate ?? booking.event.startsAt),
      amountMinor: booking.totalMinor.toString(),
      currency: booking.currency,
      requestId: quote?.requestId ?? null,
      bookingId: booking.id,
      vendorOrgId: booking.vendorOrgId,
      updatedAt: booking.createdAt.toISOString(),
    });
  }
  const requestCategory = new Map(requests.map((request) => [request.id, request.category]));
  for (const quote of quotes) {
    if (seenQuotes.has(quote.id)) continue;
    // Only the newest quote per request.
    if (quote.requestId && seenRequests.has(quote.requestId)) continue;
    if (quote.requestId) seenRequests.add(quote.requestId);
    rows.push({
      id: quote.id,
      stage: stageForQuote(quote.status),
      status: quote.status,
      eventId: quote.event.id,
      eventName: quote.event.name,
      counterparty: party(quote),
      category: label((quote.requestId && requestCategory.get(quote.requestId)) || ''),
      categoryKey: (quote.requestId && requestCategory.get(quote.requestId)) || '',
      date: iso(quote.serviceDate ?? quote.event.startsAt),
      amountMinor: quote.totalMinor.toString(),
      currency: quote.currency,
      requestId: quote.requestId,
      bookingId: null,
      vendorOrgId: quote.vendorOrgId,
      updatedAt: (quote.sentAt ?? quote.createdAt).toISOString(),
    });
  }
  for (const request of requests) {
    if (seenRequests.has(request.id)) continue;
    rows.push({
      id: request.id,
      stage: request.status === 'OPEN' ? 'requested' : 'closed',
      status: request.status,
      eventId: request.event.id,
      eventName: request.event.name,
      counterparty: party(request),
      category: label(request.category),
      categoryKey: request.category,
      date: iso(request.event.startsAt),
      amountMinor: null,
      currency: null,
      requestId: request.id,
      bookingId: null,
      vendorOrgId: request.vendorOrgId,
      updatedAt: request.createdAt.toISOString(),
    });
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function countByStage(rows: OrderRow[]): Record<OrderStage, number> {
  const counts = Object.fromEntries(ORDER_STAGES.map((stage) => [stage, 0])) as Record<OrderStage, number>;
  for (const row of rows) counts[row.stage] += 1;
  return counts;
}

export const vendorOrdersSchema = z.object({ orgId: z.string().uuid() });

/** A vendor's orders: who asked, who booked, what's paid and what's next. */
export async function vendorOrders(actor: UserActor, raw: z.input<typeof vendorOrdersSchema>, now = new Date()) {
  const input = vendorOrdersSchema.parse(raw);
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId: input.orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: input.orgId }, select: { kind: true } }),
  ]);
  if (!org || org.kind !== 'VENDOR') throw new NotFoundError('Vendor not found');
  authorizeOrg(actor, 'org.view', input.orgId, membership ? { orgId: input.orgId, role: membership.role } : null);
  const rows = await buildOrders({ vendorOrgId: input.orgId }, 'vendor', now);
  return { rows, counts: countByStage(rows) };
}

/** Orders across the events I host, co-host or plan (host and planner dashboards, D-X35). */
export async function myEventOrders(actor: UserActor, now = new Date()) {
  const events = await prisma.eventParticipant.findMany({
    where: {
      userId: actor.userId,
      removedAt: null,
      role: { in: ['HOST', 'CO_HOST', 'PLANNER', 'PLANNER_STAFF'] },
      event: { deletedAt: null, status: { not: 'DRAFT' } },
    },
    select: { eventId: true },
    take: 200,
  });
  const rows = events.length
    ? await buildOrders({ eventId: { in: events.map((row) => row.eventId) } }, 'client', now)
    : [];
  return { rows, counts: countByStage(rows) };
}
