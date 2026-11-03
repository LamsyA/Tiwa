import { z } from 'zod';

export interface PlanDraftContext {
  eventType: string;
  eventFormat: string;
  daysUntilEvent: number | null;
  expectedGuests: number | null;
  budget: { amount: string; currency: string } | null;
  existingTasks: string[];
  request: string;
}

export interface PlanDraftSuggestion {
  title: string;
  daysBefore: number | null;
  why: string;
}

export const PLAN_PROMPT_VERSION = 'plan-draft@3';

export const planSchema = z.object({
  tasks: z.array(z.object({ title: z.string(), daysBefore: z.number().nullable(), why: z.string() })).max(25),
});

export const PLAN_SYSTEM = [
  'You help people plan their own events (birthdays, weddings, funerals, church programmes, reunions, corporate events, concerts and more) without a professional planner.',
  "Turn the host's request into a practical checklist of 6 to 20 tasks that fits their event, timing, guest count and budget.",
  'Respect what they ask for and skip anything they say they do not want. Do not repeat tasks they already have.',
  'Be specific to their request, not generic. Order tasks from earliest to latest.',
  'Never include personal data, prices you were not given, or vendor names.',
  'Reply with JSON only, exactly this shape: {"tasks":[{"title":string,"daysBefore":integer|null,"why":string}]}. title is short and imperative (max 80 characters); daysBefore = days before the event it should be done (0 = on the day, null if timing does not matter); why is one short sentence.',
].join(' ');

export function describePlan(context: PlanDraftContext): string {
  return [
    `Event type: ${context.eventType} (${context.eventFormat.toLowerCase().replace(/_/g, ' ')})`,
    context.daysUntilEvent !== null ? `Days until the event: ${context.daysUntilEvent}` : 'Date: not set yet',
    context.expectedGuests
      ? `Saved guest estimate (use the request instead if it gives a number): ${context.expectedGuests}`
      : null,
    context.budget
      ? `Saved total budget (use the request instead if it gives one): ${context.budget.amount} ${context.budget.currency}`
      : null,
    context.existingTasks.length > 0 ? `Tasks they already have:\n- ${context.existingTasks.join('\n- ')}` : null,
    `What they want help with:\n${context.request}`,
  ]
    .filter(Boolean)
    .join('\n');
}
