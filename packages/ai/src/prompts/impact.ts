import { z } from 'zod';
import { withTiwa } from './tiwa.js';

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

export const IMPACT_PROMPT_VERSION = 'guest-impact@2';

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

export const IMPACT_SYSTEM = withTiwa(
  [
    'The host is changing the guest count. List exactly what that changes for this event and the next step for each.',
    'For each booking, scale per-head items in proportion and give the new quantity (round sensibly: portions to whole numbers, tables of 10). Say whether the vendor must approve a change: in Tiwa the host uses "Guest count changed" on the Guests tab and each affected vendor approves the new total from a WhatsApp link.',
    'Then cover what is not booked yet but clearly changes: venue capacity, seating and tables, chairs, souvenirs and take-away packs, drinks, invitations to send or withdraw, and the budget lines in the Money tab.',
    'Be concrete and short. Never invent prices or vendor names beyond those given.',
    'Reply with JSON only, exactly: {"items":[{"area":string,"change":string,"action":string,"urgency":"high"|"medium"|"low"}]}. area: a few words; change: what changes with numbers; action: the next step and where in Tiwa. high = affects a booked vendor or the venue.',
  ].join('\n'),
);

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
