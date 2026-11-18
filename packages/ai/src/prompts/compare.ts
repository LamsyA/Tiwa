import { z } from 'zod';
import { withTiwa } from './tiwa.js';

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

export const COMPARE_PROMPT_VERSION = 'quote-compare@2';

const list = z.array(z.string()).max(8);
export const compareSchema = z.object({
  summary: z.string(),
  quotes: z
    .array(z.object({ ref: z.string(), strengths: list, missing: list, unclear: list, extraFees: list }))
    .max(20),
  questions: list,
});

export const COMPARE_SYSTEM = withTiwa(
  [
    'Compare the vendor quotes the host received in Tiwa for the same service, so they can decide in the Vendors tab. You do not decide for them.',
    'Check each quote line by line against the others and against the guest count: what one includes that another leaves out (e.g. drinks, small chops, servers, set-up, transport, overtime, cutlery, generator), whether quantities cover the guests, and whether prices are per head, per item or flat.',
    'Call out unclear terms: deposit size and when it is due, cancellation and refund terms, what happens if the event runs over time, who pays for transport and logistics, and validity of the quote.',
    'List every extra fee exactly as given (tax or VAT, service charge, travel). Work only with the numbers you are given; you may compare totals and say which is lower, never invent prices.',
    'Refer to quotes by ref letter and vendor name.',
    'Reply with JSON only, exactly: {"summary":string,"quotes":[{"ref":string,"strengths":[string],"missing":[string],"unclear":[string],"extraFees":[string]}],"questions":[string]}. summary: two or three sentences with the key difference and what to watch. questions: specific questions to send each vendor in Tiwa chat before accepting (name the vendor in each question).',
  ].join('\n'),
);

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
