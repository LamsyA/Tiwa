import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import { aiEventContext } from './context.js';

// Guest-count impact list (PRD AI-03, P15-T04): "if we go from 120 to 150
// guests, what changes?" Uses booking quantities and seating, never prices
// or guest details. Read-only: the host acts on the list themselves.

type UserActor = Extract<Actor, { kind: 'user' }>;

export interface GuestImpactContext {
  eventType: string;
  fromGuests: number;
  toGuests: number;
  bookings: { category: string; vendor: string; items: { name: string; qty: number }[] }[];
  budgetCategories: string[];
  tables: { count: number; seats: number } | null;
}

export interface ImpactDrafter {
  guestImpact(context: GuestImpactContext): Promise<{
    items: { area: string; change: string; action: string; urgency: 'high' | 'medium' | 'low' }[];
  } | null>;
}

export const guestImpactSchema = z.object({
  eventId: z.string().uuid(),
  toGuests: z.number().int().min(1).max(100_000),
});

const URGENCY = ['high', 'medium', 'low'] as const;

export async function aiGuestImpact(drafter: ImpactDrafter, actor: UserActor, raw: z.input<typeof guestImpactSchema>) {
  const input = guestImpactSchema.parse(raw);
  const { event } = await aiEventContext(actor, input.eventId, 'event.view', 'ai.draftPlan');
  const [guestCount, bookings, categories, tables] = await Promise.all([
    prisma.guest.count({ where: { eventId: input.eventId, deletedAt: null, rsvp: { not: 'NO' } } }),
    prisma.booking.findMany({
      where: { eventId: input.eventId, status: { notIn: ['CANCELLED'] } },
      select: {
        category: true,
        vendorOrgId: true,
        versions: { where: { status: 'ACCEPTED' }, select: { scope: true }, take: 1 },
      },
    }),
    prisma.budgetCategory.findMany({ where: { eventId: input.eventId }, select: { label: true } }),
    prisma.seatingTable.aggregate({
      where: { eventId: input.eventId },
      _count: { _all: true },
      _sum: { capacity: true },
    }),
  ]);
  const fromGuests = event.expectedGuests ?? guestCount;
  if (fromGuests === input.toGuests) {
    throw new ValidationError('That is the guest count you already have', { field: 'ai', key: 'sameCount' });
  }
  const orgs = await prisma.organization.findMany({
    where: { id: { in: [...new Set(bookings.map((row) => row.vendorOrgId))] } },
    select: { id: true, name: true },
  });
  const names = new Map(orgs.map((org) => [org.id, org.name]));

  const result = await drafter.guestImpact({
    eventType: event.typeLabel,
    fromGuests,
    toGuests: input.toGuests,
    bookings: bookings.map((row) => {
      const scope = (row.versions[0]?.scope ?? {}) as { items?: { name: string; qty: number }[] };
      return {
        category: row.category,
        vendor: names.get(row.vendorOrgId) ?? row.category,
        items: (scope.items ?? [])
          .slice(0, 20)
          .map((item) => ({ name: String(item.name).slice(0, 120), qty: item.qty })),
      };
    }),
    budgetCategories: categories.map((row) => row.label).slice(0, 30),
    tables: tables._count._all > 0 ? { count: tables._count._all, seats: tables._sum.capacity ?? 0 } : null,
  });
  await audit(prisma, {
    actor,
    action: 'ai.guestImpact',
    targetType: 'Event',
    targetId: input.eventId,
    data: { ok: result !== null, from: fromGuests, to: input.toGuests },
  });
  if (!result)
    throw new ValidationError('The assistant could not work that out — try again', { field: 'ai', key: 'noDraft' });
  return {
    fromGuests,
    toGuests: input.toGuests,
    items: result.items.slice(0, 15).map((item) => ({
      area: String(item.area).slice(0, 80),
      change: String(item.change).slice(0, 200),
      action: String(item.action).slice(0, 200),
      urgency: URGENCY.includes(item.urgency) ? item.urgency : ('medium' as const),
    })),
  };
}
