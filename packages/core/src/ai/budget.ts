import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import { aiEventContext, aiSafeText, toMajor } from './context.js';

// AI budget split (PRD AI-01, P15-T03). The model proposes a percentage per
// existing budget category; core turns it into exact minor-unit amounts that
// add up to the planned total. Nothing is saved here: the host reviews and
// taps Apply, which calls the normal `setAllocations` (AI-06).

type UserActor = Extract<Actor, { kind: 'user' }>;

export interface BudgetDraftContext {
  eventType: string;
  eventFormat: string;
  expectedGuests: number | null;
  total: string;
  currency: string;
  categories: { key: string; label: string }[];
  request: string;
}

export interface BudgetDrafter {
  draftBudget(
    context: BudgetDraftContext,
  ): Promise<{ lines: { key: string; percent: number; why: string }[]; note: string } | null>;
}

export const draftBudgetSplitSchema = z.object({
  eventId: z.string().uuid(),
  request: z.string().trim().max(1000).default(''),
});

export interface BudgetSplitLine {
  key: string;
  label: string;
  percent: number;
  plannedMinor: string;
  currentMinor: string;
  why: string;
}

/** Percent per category → amounts that sum exactly to the total (largest remainder). */
export function splitByPercent(totalMinor: bigint, lines: { key: string; percent: number }[]) {
  const weights = lines.map((line) => BigInt(Math.max(0, Math.round(line.percent * 100))));
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) return lines.map(() => 0n);
  const raw = weights.map((weight) => (totalMinor * weight) / sum);
  let left = totalMinor - raw.reduce((a, b) => a + b, 0n);
  const order = weights
    .map((weight, i) => ({ i, rem: (totalMinor * weight) % sum }))
    .sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : 0));
  for (const { i } of order) {
    if (left === 0n) break;
    raw[i]! += 1n;
    left -= 1n;
  }
  return raw;
}

export async function draftBudgetSplit(
  drafter: BudgetDrafter,
  actor: UserActor,
  raw: z.input<typeof draftBudgetSplitSchema>,
) {
  const input = draftBudgetSplitSchema.parse(raw);
  const { event } = await aiEventContext(actor, input.eventId, 'money.edit', 'ai.draftPlan');
  if (event.plannedBudgetMinor <= 0n)
    throw new ValidationError('Set a total budget first', { field: 'ai', key: 'noBudget' });
  const categories = await prisma.budgetCategory.findMany({
    where: { eventId: input.eventId },
    orderBy: { sortOrder: 'asc' },
    select: { key: true, label: true, plannedMinor: true },
  });
  if (categories.length === 0)
    throw new ValidationError('Add budget categories first', { field: 'ai', key: 'noCategories' });

  const draft = await drafter.draftBudget({
    eventType: event.typeLabel,
    eventFormat: event.format,
    expectedGuests: event.expectedGuests,
    total: toMajor(event.plannedBudgetMinor, event.currency),
    currency: event.currency,
    categories: categories.map((row) => ({ key: row.key, label: row.label })),
    request: aiSafeText(input.request, event.countryCode),
  });
  await audit(prisma, {
    actor,
    action: 'ai.draftBudget',
    targetType: 'Event',
    targetId: input.eventId,
    data: { ok: draft !== null },
  });
  if (!draft)
    throw new ValidationError('The assistant could not split the budget — try again', { field: 'ai', key: 'noDraft' });

  // Only known categories, once each; anything else the model returned is dropped.
  const byKey = new Map(categories.map((row) => [row.key, row]));
  const seen = new Set<string>();
  const proposed = draft.lines.filter((line) => byKey.has(line.key) && !seen.has(line.key) && seen.add(line.key));
  if (proposed.length === 0)
    throw new ValidationError('The assistant could not split the budget', { field: 'ai', key: 'noDraft' });
  const amounts = splitByPercent(event.plannedBudgetMinor, proposed);
  const lines: BudgetSplitLine[] = categories.map((row) => {
    const at = proposed.findIndex((line) => line.key === row.key);
    const minor = at >= 0 ? amounts[at]! : 0n;
    return {
      key: row.key,
      label: row.label,
      percent: Number((minor * 1000n) / event.plannedBudgetMinor) / 10,
      plannedMinor: minor.toString(),
      currentMinor: row.plannedMinor.toString(),
      why: at >= 0 ? String(proposed[at]!.why ?? '').slice(0, 200) : '',
    };
  });
  return {
    totalMinor: event.plannedBudgetMinor.toString(),
    currency: event.currency,
    lines,
    note: String(draft.note ?? '').slice(0, 400),
  };
}
