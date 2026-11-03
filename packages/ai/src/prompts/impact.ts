import { z } from 'zod';

export interface GuestImpactContext {
  eventType: string;
  fromGuests: number;
  toGuests: number;
  bookings: { category: string; vendor: string; items: { name: string; qty: number }[] }[];
  budgetCategories: string[];
  tables: { count: number; seats: number } | null;
}

export interface GuestImpactList {
  items: { area: string; change: string; action: string; urgency: 'high' | 'medium' | 'low' }[];
}

export const IMPACT_PROMPT_VERSION = 'guest-impact@1';

export const impactSchema = z.object({
  items: z
    .array(
      z.object({
        area: z.string(),
        change: z.string(),
        action: z.string(),
        urgency: z.enum(['high', 'medium', 'low']),
      }),
    )
    .max(15),
});

export const IMPACT_SYSTEM = [
  'An event host is changing their guest count. List what that affects and what to do about it.',
  'Use the bookings, quantities and seating you are given; scale per-head items in proportion and say the new numbers. Include things not booked yet only if they clearly matter (venue capacity, seating, invitations).',
  'Be concrete and short. Never invent prices or vendor names beyond those given.',
  'Reply with JSON only, exactly this shape: {"items":[{"area":string,"change":string,"action":string,"urgency":"high"|"medium"|"low"}]}. area: a few words; change: what changes; action: the next step.',
].join(' ');

export function describeImpact(context: GuestImpactContext): string {
  return [
    `Event type: ${context.eventType}`,
    `Guest count: ${context.fromGuests} → ${context.toGuests}`,
    context.tables ? `Seating: ${context.tables.count} tables, ${context.tables.seats} seats in total` : null,
    context.bookings.length > 0
      ? `Bookings:\n${context.bookings
          .map(
            (row) =>
              `- ${row.category} (${row.vendor}): ${row.items.map((item) => `${item.qty} × ${item.name}`).join('; ')}`,
          )
          .join('\n')}`
      : 'No vendor bookings yet.',
    context.budgetCategories.length > 0 ? `Budget categories: ${context.budgetCategories.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
