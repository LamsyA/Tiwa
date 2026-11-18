import { z } from 'zod';
import { withTiwa } from './tiwa.js';

export interface PlanDraftContext {
  eventType: string;
  eventFormat: string;
  daysUntilEvent: number | null;
  expectedGuests: number | null;
  budget: { amount: string; currency: string } | null;
  existingTasks: string[];
  request: string;
  /** D-X94: the event's real state, so the plan fits it exactly. All optional. */
  eventName?: string | null;
  /** e.g. "Saturday 14 March 2026, 4:00 PM". */
  whenText?: string | null;
  city?: string | null;
  country?: string | null;
  venue?: string | null;
  durationHours?: number | null;
  guests?: { invited: number; attending: number; notReplied: number } | null;
  /** Vendor categories booked (accepted quotes) and only shortlisted/quoting. */
  booked?: string[];
  inProgress?: string[];
  /** Categories Tiwa suggests for this event type. */
  typicalVendors?: string[];
  /** Tiwa's standard checklist for this event type, to tailor (not copy). */
  templateChecklist?: string[];
  committed?: { amount: string; currency: string } | null;
  features?: { invites: boolean; tickets: boolean; moments: boolean };
  hasProgramme?: boolean;
  /** Who is asking: the host or their planner. */
  askedBy?: 'host' | 'planner' | 'co-host';
}

export interface PlanDraftSuggestion {
  title: string;
  daysBefore: number | null;
  why: string;
}

export const PLAN_PROMPT_VERSION = 'plan-draft@5';

export const planSchema = z.object({
  tasks: z.array(z.object({ title: z.string(), daysBefore: z.number().nullable(), why: z.string() })).max(25),
});

export const PLAN_SYSTEM = withTiwa(
  [
    "Build this event's task checklist for the Plan tab: 8 to 20 tasks that take it from today to the day after, fitted exactly to the facts below.",
    'How to plan it:',
    '1. Start from what is NOT done yet. Skip anything already on the list or already booked; for vendors that are only shortlisted or quoting, the task is to compare and book them, not to find them again.',
    '2. Time every task from the real days left. daysBefore must be between 0 and the days until the event. Put each task at its real lead time (see the lead times above); when there is not enough time, put it as early as possible and say so in why. If the event is very close, focus on what can still be done.',
    '3. Use the numbers. Size food, drinks, chairs, tables, souvenirs and invites from the guest count (prefer confirmed attending when there are RSVPs). Put the quantity in the title, e.g. "Book catering for 130 (120 guests + 10%)", "Rent 13 round tables and 130 chairs".',
    '4. Respect the budget. When a budget is given, mention the share for big items in why (e.g. "about 35% of the budget"); when money is already committed, plan the deposits and balances still to pay. Never invent prices.',
    '5. Cover the whole event: venue and logistics, each vendor this event type needs, guests and invitations, the programme and people on it (MC, speakers, ministers), payments, the day itself (vendor arrival confirmations, set-up, check-in, run-of-show) and after (pay balances, review vendors, thank guests).',
    '6. Point to Tiwa. End why with where to do it, e.g. "Do it in Vendors → Catering", "Send from the Invites tab", "Add it to the Programme tab", "Record the deposit in Money". Only mention tabs that exist for this event (invites and tickets only when switched on).',
    '7. Follow the request. If the host or planner asks for something specific, every task must serve it; if they ask for one area (e.g. "just the food"), plan only that area in depth.',
    'Titles: short and imperative, max 80 characters, specific (never "Plan the event" or "Contact vendors"). why: one sentence, max 160 characters.',
    'Reply with JSON only, exactly: {"tasks":[{"title":string,"daysBefore":integer|null,"why":string}]}. Order from earliest (largest daysBefore) to latest. daysBefore 0 = on the day; null only when timing truly does not matter.',
  ].join('\n'),
);

export function describePlan(context: PlanDraftContext): string {
  const list = (label: string, values: string[] | undefined) =>
    values && values.length > 0 ? `${label}: ${values.join(', ')}` : null;
  return [
    `Event: ${context.eventName ? `"${context.eventName}", ` : ''}${context.eventType} (${context.eventFormat
      .toLowerCase()
      .replace(/_/g, ' ')})`,
    context.askedBy ? `Asked by: the ${context.askedBy}` : null,
    context.whenText ? `When: ${context.whenText}` : 'Date: not set yet',
    context.daysUntilEvent !== null ? `Days until the event: ${context.daysUntilEvent}` : null,
    context.durationHours ? `Length: about ${context.durationHours} hours` : null,
    context.venue || context.city || context.country
      ? `Where: ${[context.venue, context.city, context.country].filter(Boolean).join(', ')}`
      : 'Venue: not chosen yet',
    context.expectedGuests ? `Expected guests: ${context.expectedGuests}` : 'Guest count: not set',
    context.guests && context.guests.invited > 0
      ? `RSVPs so far: ${context.guests.invited} invited, ${context.guests.attending} attending, ${context.guests.notReplied} not replied`
      : null,
    context.budget ? `Total budget: ${context.budget.amount} ${context.budget.currency}` : null,
    context.committed
      ? `Already committed to vendors: ${context.committed.amount} ${context.committed.currency}`
      : null,
    list('Already booked', context.booked) ?? 'Already booked: nothing yet',
    list('Shortlisted or waiting on quotes (not booked yet)', context.inProgress),
    list('Vendors this kind of event usually needs', context.typicalVendors),
    context.features
      ? `Switched on in Tiwa: ${
          [context.features.invites ? 'invites' : null, context.features.tickets ? 'tickets' : null]
            .filter(Boolean)
            .join(', ') || 'neither invites nor tickets'
        }`
      : null,
    context.hasProgramme !== undefined
      ? `Programme for guests: ${context.hasProgramme ? 'started' : 'not started'}`
      : null,
    context.existingTasks.length > 0
      ? `Tasks already on the list (do not repeat):\n- ${context.existingTasks.join('\n- ')}`
      : 'Tasks already on the list: none',
    context.templateChecklist && context.templateChecklist.length > 0
      ? `Tiwa's usual checklist for this event type (tailor it, do not copy blindly):\n- ${context.templateChecklist.join('\n- ')}`
      : null,
    `Request:\n${context.request}`,
  ]
    .filter(Boolean)
    .join('\n');
}
