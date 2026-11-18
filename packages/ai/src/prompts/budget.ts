import { z } from 'zod';
import { withTiwa } from './tiwa.js';

export interface BudgetDraftContext {
  eventType: string;
  eventFormat: string;
  expectedGuests: number | null;
  /** Total in major units, as text. */
  total: string;
  currency: string;
  categories: { key: string; label: string }[];
  request: string;
}

export interface BudgetSplitDraft {
  lines: { key: string; percent: number; why: string }[];
  note: string;
}

export const BUDGET_PROMPT_VERSION = 'budget-split@2';

export const budgetSchema = z.object({
  lines: z.array(z.object({ key: z.string(), percent: z.number(), why: z.string() })).max(50),
  note: z.string(),
});

export const BUDGET_SYSTEM = withTiwa(
  [
    "Split this event's total budget across its own budget categories for the Money tab.",
    'Use only the category keys you are given. Percentages are whole numbers that add up to exactly 100; leave out categories that need no money.',
    'Weigh it the way this kind of event really spends in this country: food and drinks usually take the biggest share at Nigerian parties and weddings (often 35 to 45 percent), then venue, then decor, entertainment and photography; burials weigh the venue, canopies and chairs, catering and printing (programmes, obituaries); conferences weigh venue, AV and catering per session.',
    'Size per-head categories from the guest count (say the per-guest amount in why when it helps, e.g. "about 4,500 per guest for 120 guests") and keep 5 to 10 percent as a contingency line if a fitting category exists.',
    'Follow anything the host asks for (e.g. "spend more on decor") and say what you reduced to make room.',
    'Never mention vendor names or invent quoted prices.',
    'Reply with JSON only, exactly: {"lines":[{"key":string,"percent":integer,"why":string}],"note":string}. why: one sentence (max 140 characters) naming the reason for this event; note: one or two sentences of the most important advice for this budget, including where to act in Tiwa (e.g. "book catering first in Vendors").',
  ].join('\n'),
);

export function describeBudget(context: BudgetDraftContext): string {
  return [
    `Event type: ${context.eventType} (${context.eventFormat.toLowerCase().replace(/_/g, ' ')})`,
    context.expectedGuests ? `Expected guests: ${context.expectedGuests}` : null,
    `Total budget: ${context.total} ${context.currency}`,
    `Categories (key: label):\n${context.categories.map((row) => `- ${row.key}: ${row.label}`).join('\n')}`,
    context.request ? `What the host wants:\n${context.request}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
