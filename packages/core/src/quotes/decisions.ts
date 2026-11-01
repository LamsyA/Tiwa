import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize } from '../auth/authorize.js';
import { loadEventAccess, requireEventAccess } from '../events/access.js';
import { NotFoundError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';
import type { Actor } from '../auth/authorize.js';
import { assertQuoteTransition } from './state.js';

// Host-side quote decisions (QTE-04, UF-16): compare side by side, request
// changes, or decline. Acceptance lives in bookings/accept.ts because it
// creates the Booking. Vendor isolation: VENDOR/PHOTOGRAPHER participants
// never see another vendor's quote (UF-15-2).

type UserActor = Extract<Actor, { kind: 'user' }>;

function toQuoteRow(quote: {
  id: string;
  eventId: string;
  vendorOrgId: string;
  requestId: string | null;
  status: string;
  items: unknown;
  taxBps: number;
  serviceBps: number;
  travelFeeMinor: bigint;
  subtotalMinor: bigint;
  totalMinor: bigint;
  currency: string;
  notes: string | null;
  cancellationTerms: string;
  proposedSchedule: unknown;
  expiresAt: Date;
  sentAt: Date | null;
}) {
  return {
    ...quote,
    travelFeeMinor: quote.travelFeeMinor.toString(),
    subtotalMinor: quote.subtotalMinor.toString(),
    totalMinor: quote.totalMinor.toString(),
  };
}

async function hostQuote(actor: UserActor, quoteId: string) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  const access = await loadEventAccess(actor.userId, quote.eventId);
  if (!access) throw new NotFoundError('Quote not found');
  if (access.role === 'VENDOR' || access.role === 'PHOTOGRAPHER') throw new NotFoundError('Quote not found');
  return { quote, access };
}

export const compareQuotesSchema = z.object({
  eventId: z.string().uuid(),
  category: z.string().min(1).max(60).optional(),
});

/** Side-by-side compare (QTE-03, UF-16): decided-state quotes with vendor names. */
export async function compareQuotes(actor: UserActor, raw: z.infer<typeof compareQuotesSchema>) {
  const input = compareQuotesSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.view');
  let requestIds: string[] | undefined;
  if (input.category) {
    const requests = await prisma.quoteRequest.findMany({
      where: { eventId: input.eventId, category: input.category },
      select: { id: true },
    });
    requestIds = requests.map((row) => row.id);
  }
  const quotes = await prisma.quote.findMany({
    where: {
      eventId: input.eventId,
      ...(requestIds ? { requestId: { in: requestIds } } : {}),
      status: { in: ['SENT', 'CHANGES_REQUESTED', 'ACCEPTED', 'DECLINED'] },
    },
    orderBy: { totalMinor: 'asc' },
  });
  if (quotes.length === 0) return [];
  const orgs = await prisma.organization.findMany({
    where: { id: { in: [...new Set(quotes.map((quote) => quote.vendorOrgId))] } },
    select: { id: true, name: true, slug: true, verification: true },
  });
  const byId = new Map(orgs.map((org) => [org.id, org]));
  return quotes.map((quote) => ({ ...toQuoteRow(quote), vendor: byId.get(quote.vendorOrgId) ?? null }));
}

export const requestChangesSchema = z.object({
  quoteId: z.string().uuid(),
  message: z.string().trim().min(1, 'messageRequired').max(2000, 'messageTooLong'),
});

/** Host asks the vendor to revise: SENT → CHANGES_REQUESTED. */
export async function requestQuoteChanges(actor: UserActor, raw: z.infer<typeof requestChangesSchema>) {
  const input = requestChangesSchema.parse(raw);
  const { quote } = await hostQuote(actor, input.quoteId);
  authorize(actor, 'event.edit', { eventId: quote.eventId, access: await loadEventAccess(actor.userId, quote.eventId) });
  assertQuoteTransition(quote.status, 'CHANGES_REQUESTED');
  const updated = await prisma.quote.update({ where: { id: quote.id }, data: { status: 'CHANGES_REQUESTED' } });
  await audit(prisma, {
    actor,
    action: 'quote.requestChanges',
    targetType: 'Quote',
    targetId: quote.id,
    data: { eventId: quote.eventId, vendorOrgId: quote.vendorOrgId },
  });
  await enqueue(prisma, 'quote.changes_requested', {
    quoteId: quote.id,
    eventId: quote.eventId,
    vendorOrgId: quote.vendorOrgId,
    message: input.message,
  });
  return { status: updated.status };
}

export const declineQuoteSchema = z.object({ quoteId: z.string().uuid() });

/** Host declines: SENT | CHANGES_REQUESTED → DECLINED. */
export async function declineQuote(actor: UserActor, raw: z.infer<typeof declineQuoteSchema>) {
  const { quoteId } = declineQuoteSchema.parse(raw);
  const { quote } = await hostQuote(actor, quoteId);
  authorize(actor, 'event.edit', { eventId: quote.eventId, access: await loadEventAccess(actor.userId, quote.eventId) });
  assertQuoteTransition(quote.status, 'DECLINED');
  const updated = await prisma.quote.update({ where: { id: quote.id }, data: { status: 'DECLINED' } });
  await audit(prisma, {
    actor,
    action: 'quote.decline',
    targetType: 'Quote',
    targetId: quote.id,
    data: { eventId: quote.eventId, vendorOrgId: quote.vendorOrgId },
  });
  await enqueue(prisma, 'quote.declined', { quoteId: quote.id, eventId: quote.eventId, vendorOrgId: quote.vendorOrgId });
  return { status: updated.status };
}
