import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';

// Money page lists (UF-20 tabs): the payment schedule across bookings,
// expenses and contributions. All need `money.view`.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const moneyListSchema = z.object({ eventId: z.string().uuid() });

/** Every milestone on the event's live bookings, soonest due first (Payments tab). */
export async function listPaymentSchedule(
  actor: UserActor,
  raw: z.input<typeof moneyListSchema>,
  preloaded?: EventAccess,
) {
  const { eventId } = moneyListSchema.parse(raw);
  await resolveEventAccess(actor, eventId, 'money.view', preloaded);
  const rows = await prisma.paymentMilestone.findMany({
    where: { booking: { eventId, status: { not: 'CANCELLED' } } },
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: {
      id: true,
      label: true,
      amountMinor: true,
      currency: true,
      dueAt: true,
      state: true,
      booking: { select: { id: true, category: true, vendorOrgId: true } },
    },
  });
  const orgs = await prisma.organization.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.booking.vendorOrgId))] } },
    select: { id: true, name: true },
  });
  const names = new Map(orgs.map((org) => [org.id, org.name]));
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    amountMinor: row.amountMinor.toString(),
    currency: row.currency,
    dueAt: row.dueAt?.toISOString() ?? null,
    state: row.state,
    bookingId: row.booking.id,
    category: row.booking.category,
    vendorName: names.get(row.booking.vendorOrgId) ?? '',
  }));
}

export async function listExpenses(actor: UserActor, raw: z.input<typeof moneyListSchema>, preloaded?: EventAccess) {
  const { eventId } = moneyListSchema.parse(raw);
  await resolveEventAccess(actor, eventId, 'money.view', preloaded);
  const rows = await prisma.expense.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      categoryKey: true,
      description: true,
      amountMinor: true,
      currency: true,
      paidAt: true,
      receiptKey: true,
      createdAt: true,
    },
  });
  return rows.map(({ receiptKey, ...row }) => ({
    ...row,
    amountMinor: row.amountMinor.toString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    hasReceipt: !!receiptKey,
  }));
}

export async function listContributions(
  actor: UserActor,
  raw: z.input<typeof moneyListSchema>,
  preloaded?: EventAccess,
) {
  const { eventId } = moneyListSchema.parse(raw);
  await resolveEventAccess(actor, eventId, 'money.view', preloaded);
  const rows = await prisma.contribution.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      contributorName: true,
      contributorPhone: true,
      kind: true,
      pledgedMinor: true,
      receivedMinor: true,
      currency: true,
      notes: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    pledgedMinor: row.pledgedMinor.toString(),
    receivedMinor: row.receivedMinor.toString(),
  }));
}
