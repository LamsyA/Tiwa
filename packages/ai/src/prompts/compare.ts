import { z } from 'zod';

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

export interface QuoteComparison {
  summary: string;
  quotes: { ref: string; strengths: string[]; missing: string[]; unclear: string[]; extraFees: string[] }[];
  questions: string[];
}

export const COMPARE_PROMPT_VERSION = 'quote-compare@1';

const list = z.array(z.string()).max(8);
export const compareSchema = z.object({
  summary: z.string(),
  quotes: z
    .array(z.object({ ref: z.string(), strengths: list, missing: list, unclear: list, extraFees: list }))
    .max(20),
  questions: list,
});

export const COMPARE_SYSTEM = [
  'You help an event host compare vendor quotes for the same service. You do not decide for them.',
  'Point out: items one quote includes that others leave out, unclear or vague terms (cancellation, deposits, what "per head" covers), and extra fees (tax, service charge, travel).',
  'Be factual and short. Only use the numbers you are given. Refer to quotes by their ref letter and vendor name.',
  'Reply with JSON only, exactly this shape: {"summary":string,"quotes":[{"ref":string,"strengths":[string],"missing":[string],"unclear":[string],"extraFees":[string]}],"questions":[string]}. summary: two or three sentences. questions: things the host should ask vendors before deciding.',
].join(' ');

export function describeCompare(context: QuoteCompareContext): string {
  const quotes = context.quotes.map((quote) =>
    [
      `Quote ${quote.ref} — ${quote.vendor}`,
      `Items: ${quote.items.map((item) => `${item.qty} × ${item.name} @ ${item.unit}`).join('; ') || 'none listed'}`,
      `Tax ${quote.taxPercent}%, service charge ${quote.servicePercent}%, travel fee ${quote.travelFee}`,
      `Total: ${quote.total} ${context.currency}`,
      `Payment schedule: ${quote.schedule}`,
      `Cancellation terms: ${quote.cancellationTerms}`,
      quote.notes ? `Notes: ${quote.notes}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return [
    `Service: ${context.category} for a ${context.eventType}`,
    context.expectedGuests ? `Expected guests: ${context.expectedGuests}` : null,
    ...quotes,
  ]
    .filter(Boolean)
    .join('\n\n');
}
