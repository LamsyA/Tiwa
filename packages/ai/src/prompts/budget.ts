import { z } from 'zod';

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

export const BUDGET_PROMPT_VERSION = 'budget-split@1';

export const budgetSchema = z.object({
  lines: z.array(z.object({ key: z.string(), percent: z.number(), why: z.string() })).max(50),
  note: z.string(),
});

export const BUDGET_SYSTEM = [
  'You help hosts split an event budget across their own budget categories.',
  'Use only the category keys you are given. Percentages are whole numbers that add up to 100; leave out categories that do not need money.',
  'Weigh what matters for this kind of event and the guest count, and follow anything the host asks for.',
  'Never mention vendor names or invent prices.',
  'Reply with JSON only, exactly this shape: {"lines":[{"key":string,"percent":integer,"why":string}],"note":string}. why is one short sentence; note is one or two sentences of overall advice.',
].join(' ');

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
