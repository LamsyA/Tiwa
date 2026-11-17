import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { loadEventAccess } from '../events/access.js';
import { pricesHiddenFor, priceVisibilityFor } from '../events/prices.js';
import { NotFoundError } from '../shared/errors.js';

// Quote / proposal history (D-X67): every version as it was sent, the change
// request the client sent back on each, and how it ended. Both sides read
// the same record — the vendor or planner team, and the host side of that
// event (vendor-role participants excluded). Anyone else gets NOT_FOUND, so
// one event's negotiation never shows up on another.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const quoteHistorySchema = z.object({ quoteId: z.string().uuid() });

export interface QuoteHistoryVersion {
  revision: number;
  items: { name: string; qty: number; unitMinor: string }[];
  subtotalMinor: string | null;
  totalMinor: string | null;
  currency: string;
  taxBps: number;
  serviceBps: number;
  travelFeeMinor: string | null;
  notes: string | null;
  cancellationTerms: string;
  schedule: { label: string; percentBps?: number; amountMinor?: string; due: string }[];
  expiresAt: string;
  sentAt: string;
  changeRequest: string | null;
  changeRequestedAt: string | null;
}

export interface QuoteHistory {
  quoteId: string;
  status: string;
  /** When the quote reached its final state (accepted, declined, withdrawn, expired). */
  closedAt: string | null;
  bookingId: string | null;
  versions: QuoteHistoryVersion[];
}

const CLOSING_ACTION: Record<string, string> = {
  DECLINED: 'quote.decline',
  WITHDRAWN: 'quote.withdraw',
  EXPIRED: 'quote.expire',
};

async function canRead(actor: UserActor, quote: { eventId: string; vendorOrgId: string }) {
  const member = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: quote.vendorOrgId, userId: actor.userId } },
    select: { role: true },
  });
  if (member) return { side: 'vendor' as const, hidden: false };
  const access = await loadEventAccess(actor.userId, quote.eventId);
  if (!access || access.role === 'VENDOR' || access.role === 'PHOTOGRAPHER') return null;
  // A planner may hide vendor prices from the host (EVT-12); history follows the same rule.
  return { side: 'host' as const, hidden: pricesHiddenFor(access, await priceVisibilityFor(quote.eventId)) };
}

export async function quoteHistory(actor: UserActor, raw: z.infer<typeof quoteHistorySchema>): Promise<QuoteHistory> {
  const { quoteId } = quoteHistorySchema.parse(raw);
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, eventId: true, vendorOrgId: true, status: true },
  });
  if (!quote) throw new NotFoundError('Quote not found');
  const reader = await canRead(actor, quote);
  if (!reader) throw new NotFoundError('Quote not found');

  const closingAction = CLOSING_ACTION[quote.status];
  const [revisions, booking, closing] = await Promise.all([
    prisma.quoteRevision.findMany({ where: { quoteId }, orderBy: { revision: 'asc' } }),
    prisma.booking.findUnique({ where: { quoteId }, select: { id: true, createdAt: true } }),
    closingAction
      ? prisma.auditLog.findFirst({
          where: { targetId: quoteId, action: closingAction },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })
      : null,
  ]);
  const money = (value: bigint) => (reader.hidden ? null : value.toString());
  return {
    quoteId,
    status: quote.status,
    closedAt: (quote.status === 'ACCEPTED' ? booking?.createdAt : closing?.createdAt)?.toISOString() ?? null,
    bookingId: booking?.id ?? null,
    versions: revisions.map((row) => ({
      revision: row.revision,
      items: (row.items as { name: string; qty: number; unitMinor: string }[]).map((item) => ({
        ...item,
        unitMinor: reader.hidden ? '0' : item.unitMinor,
      })),
      subtotalMinor: money(row.subtotalMinor),
      totalMinor: money(row.totalMinor),
      currency: row.currency,
      taxBps: row.taxBps,
      serviceBps: row.serviceBps,
      travelFeeMinor: money(row.travelFeeMinor),
      notes: row.notes,
      cancellationTerms: row.cancellationTerms,
      schedule: (row.proposedSchedule as QuoteHistoryVersion['schedule']).map((entry) =>
        reader.hidden
          ? { label: entry.label, due: entry.due, ...(entry.percentBps ? { percentBps: entry.percentBps } : {}) }
          : entry,
      ),
      expiresAt: row.expiresAt.toISOString(),
      sentAt: row.sentAt.toISOString(),
      changeRequest: row.changeRequest,
      changeRequestedAt: row.changeRequestedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Vendor or planner side (D-X67): every quote the team has sent, newest
 * first, with its event and where it stands — so answered work stays
 * reachable after it leaves the "new requests" list.
 */
export async function listSentQuotes(actor: UserActor, opts: { take?: number } = {}) {
  const memberships = await prisma.membership.findMany({
    where: { userId: actor.userId, org: { kind: { in: ['VENDOR', 'PLANNER'] }, deletedAt: null } },
    select: { orgId: true },
  });
  if (memberships.length === 0) return [];
  const quotes = await prisma.quote.findMany({
    where: {
      vendorOrgId: { in: memberships.map((row) => row.orgId) },
      sentAt: { not: null },
      requestId: { not: null },
    },
    orderBy: { sentAt: 'desc' },
    take: opts.take ?? 30,
    select: {
      id: true,
      requestId: true,
      eventId: true,
      status: true,
      totalMinor: true,
      currency: true,
      revision: true,
      sentAt: true,
    },
  });
  const events = await prisma.event.findMany({
    where: { id: { in: [...new Set(quotes.map((row) => row.eventId))] } },
    select: { id: true, name: true, startsAt: true },
  });
  const byId = new Map(events.map((row) => [row.id, row]));
  return quotes.map((row) => ({
    id: row.id,
    requestId: row.requestId as string,
    status: row.status,
    totalMinor: row.totalMinor.toString(),
    currency: row.currency,
    revision: row.revision,
    sentAt: row.sentAt?.toISOString() ?? null,
    eventName: byId.get(row.eventId)?.name ?? '',
    eventDate: byId.get(row.eventId)?.startsAt?.toISOString() ?? null,
  }));
}
