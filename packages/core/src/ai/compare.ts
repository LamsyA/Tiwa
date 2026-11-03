import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { compareQuotes } from '../quotes/decisions.js';
import { ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import { aiEventContext, aiSafeText, toMajor } from './context.js';

// AI quote comparison (PRD AI-02, P15-T04). Reads the same quotes the host
// sees on the compare page; changes nothing. Members who may not see money
// (or when a planner hides vendor prices) get a comparison with no amounts in
// the prompt at all (UF-27-2).

type UserActor = Extract<Actor, { kind: 'user' }>;

export interface QuoteCompareContext {
  category: string;
  eventType: string;
  expectedGuests: number | null;
  currency: string;
  quotes: {
    ref: string;
    vendor: string;
    items: { name: string; qty: number; unit: string }[];
    taxPercent: number;
    servicePercent: number;
    travelFee: string;
    total: string;
    notes: string | null;
    cancellationTerms: string;
    schedule: string;
  }[];
}

export interface QuoteComparer {
  compareQuotes(context: QuoteCompareContext): Promise<{
    summary: string;
    quotes: { ref: string; strengths: string[]; missing: string[]; unclear: string[]; extraFees: string[] }[];
    questions: string[];
  } | null>;
}

export const aiCompareQuotesSchema = z.object({
  eventId: z.string().uuid(),
  category: z.string().min(1).max(60),
  categoryLabel: z.string().min(1).max(80),
});

const HIDDEN = 'hidden';

function scheduleText(raw: unknown): string {
  if (!Array.isArray(raw)) return 'not given';
  return raw
    .map((row: { label?: string; percentBps?: number; due?: string }) =>
      [row.label, row.percentBps != null ? `${row.percentBps / 100}%` : null, row.due].filter(Boolean).join(' '),
    )
    .join('; ');
}

export async function aiCompareQuotes(
  comparer: QuoteComparer,
  actor: UserActor,
  raw: z.input<typeof aiCompareQuotesSchema>,
) {
  const input = aiCompareQuotesSchema.parse(raw);
  const { event, moneyVisible } = await aiEventContext(actor, input.eventId, 'event.view', 'ai.compareQuotes');
  const quotes = await compareQuotes(actor, { eventId: input.eventId, category: input.category });
  const live = quotes.filter((quote) => quote.status !== 'DECLINED');
  if (live.length < 2)
    throw new ValidationError('You need at least two quotes to compare', { field: 'ai', key: 'tooFew' });

  const money = (minor: string | bigint | null | undefined) =>
    moneyVisible && minor != null ? toMajor(BigInt(minor), event.currency) : HIDDEN;
  const refs = live.map((_, i) => String.fromCharCode(65 + i));
  const context: QuoteCompareContext = {
    category: input.categoryLabel,
    eventType: event.typeLabel,
    expectedGuests: event.expectedGuests,
    currency: event.currency,
    quotes: live.map((quote, i) => {
      const row = quote as unknown as {
        items: { name: string; qty: number; unitMinor?: string | null }[];
        taxBps: number;
        serviceBps: number;
        travelFeeMinor?: string | null;
        totalMinor?: string | null;
        notes: string | null;
        cancellationTerms: string;
        proposedSchedule: unknown;
      };
      return {
        ref: refs[i]!,
        vendor: quote.vendor?.name ?? `Vendor ${refs[i]}`,
        items: (row.items ?? []).slice(0, 40).map((item) => ({
          name: aiSafeText(item.name, event.countryCode, 120),
          qty: item.qty,
          unit: money(item.unitMinor ?? null),
        })),
        taxPercent: row.taxBps / 100,
        servicePercent: row.serviceBps / 100,
        travelFee: money(row.travelFeeMinor ?? null),
        total: money(row.totalMinor ?? null),
        notes: row.notes ? aiSafeText(row.notes, event.countryCode, 600) : null,
        cancellationTerms: aiSafeText(row.cancellationTerms, event.countryCode, 600),
        schedule: scheduleText(row.proposedSchedule),
      };
    }),
  };
  const result = await comparer.compareQuotes(context);
  await audit(prisma, {
    actor,
    action: 'ai.compareQuotes',
    targetType: 'Event',
    targetId: input.eventId,
    data: { ok: result !== null, quotes: live.length, moneyVisible },
  });
  if (!result)
    throw new ValidationError('The assistant could not compare these quotes', { field: 'ai', key: 'noDraft' });
  const list = (value: unknown) =>
    (Array.isArray(value) ? value : []).map((item) => String(item).slice(0, 200)).slice(0, 8);
  return {
    moneyVisible,
    summary: String(result.summary ?? '').slice(0, 800),
    questions: list(result.questions),
    quotes: refs.map((ref, i) => {
      const found = result.quotes.find((row) => row.ref.trim().toUpperCase() === ref);
      return {
        ref,
        quoteId: live[i]!.id,
        vendor: live[i]!.vendor?.name ?? ref,
        strengths: list(found?.strengths),
        missing: list(found?.missing),
        unclear: list(found?.unclear),
        extraFees: moneyVisible ? list(found?.extraFees) : [],
      };
    }),
  };
}
