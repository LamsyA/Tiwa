import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { requireEventAccess } from '../events/access.js';
import { createEventDraft } from '../events/commands.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Planner engagement (D-X47): turn a client into their event, agree the
// planner's fee on it, and see today across every event the org runs.

type UserActor = Extract<Actor, { kind: 'user' }>;

async function requirePlannerMember(actor: UserActor, orgId: string, action: 'org.view' | 'org.manage') {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { kind: true } }),
  ]);
  if (!org || org.kind !== 'PLANNER') throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
}

export const startClientEventSchema = z.object({
  clientId: z.string().uuid(),
  type: z.string().min(1).max(64),
});

/** Create the client's event as a draft (the wizard continues it), tie it to
 * the client and mark the lead won. */
export async function startClientEvent(actor: UserActor, raw: z.input<typeof startClientEventSchema>) {
  const input = startClientEventSchema.parse(raw);
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new NotFoundError('Client not found');
  await requirePlannerMember(actor, client.orgId, 'org.manage');
  const { eventId } = await createEventDraft(actor, { type: input.type });
  await prisma.$transaction(async (tx) => {
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } });
    await tx.event.update({
      where: { id: eventId },
      data: { clientId: client.id, name: `${client.name} · ${event.name}` },
    });
    if (client.stage !== 'WON') await tx.client.update({ where: { id: client.id }, data: { stage: 'WON' } });
    await audit(tx, {
      actor,
      action: 'planner.client.event',
      targetType: 'Client',
      targetId: client.id,
      data: { eventId, from: client.stage },
    });
  });
  return { eventId };
}

export const plannerFeeSchema = z
  .object({
    eventId: z.string().uuid(),
    /** Share of the event budget in basis points (1000 = 10%). */
    feeBps: z.number().int().min(0).max(10_000).nullable(),
    feeMinor: z.string().regex(/^\d+$/, 'amountInvalid').nullable(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((input) => input.feeBps != null || input.feeMinor != null, {
    message: 'feeRequired',
    path: ['feeBps'],
  });

/** The planner (or anyone who can edit the event) records the fee agreement. */
export async function setPlannerFee(actor: UserActor, raw: z.input<typeof plannerFeeSchema>) {
  const input = plannerFeeSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const planner = await prisma.eventParticipant.findFirst({
    where: { eventId: input.eventId, userId: actor.userId, removedAt: null, orgId: { not: null } },
    select: { orgId: true },
  });
  if (!planner)
    throw new ValidationError('Only the event planner sets a planning fee', { field: 'feeBps', key: 'plannerOnly' });
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: input.eventId },
      data: {
        plannerFeeBps: input.feeBps,
        plannerFeeMinor: input.feeMinor == null ? null : BigInt(input.feeMinor),
        plannerFeeNote: input.note ?? null,
      },
      select: { id: true, plannerFeeBps: true, plannerFeeMinor: true, plannedBudgetMinor: true, currency: true },
    });
    await audit(tx, {
      actor,
      action: 'money.plannerFee.set',
      targetType: 'Event',
      targetId: event.id,
      data: { eventId: event.id, feeBps: input.feeBps, feeMinor: input.feeMinor },
    });
    return { ...event, totalMinor: plannerFeeMinor(event) };
  });
}

/** Fixed part plus the agreed share of the planned budget, in minor units. */
export function plannerFeeMinor(event: {
  plannerFeeBps: number | null;
  plannerFeeMinor: bigint | null;
  plannedBudgetMinor: bigint;
}): bigint | null {
  if (event.plannerFeeBps == null && event.plannerFeeMinor == null) return null;
  const share = event.plannerFeeBps ? (event.plannedBudgetMinor * BigInt(event.plannerFeeBps)) / 10_000n : 0n;
  return (event.plannerFeeMinor ?? 0n) + share;
}

export interface TodayItem {
  id: string;
  kind: 'task' | 'run' | 'payment';
  title: string;
  at: Date | null;
  eventId: string;
  eventName: string;
  overdue: boolean;
  amountMinor?: bigint;
  currency?: string;
}

/** Today across every event the planner org works on: tasks due by tonight
 * (and overdue), today's run-of-show (vendor arrivals, cues), and payments
 * due within 7 days. Four queries whatever the number of events. */
export async function plannerToday(actor: UserActor, orgId: string, now = new Date()) {
  await requirePlannerMember(actor, orgId, 'org.view');
  const rows = await prisma.eventParticipant.findMany({
    where: { orgId, removedAt: null, event: { deletedAt: null, status: { in: ['DRAFT', 'ACTIVE'] } } },
    select: { event: { select: { id: true, name: true } } },
  });
  const names = new Map(rows.map((row) => [row.event.id, row.event.name] as const));
  const eventIds = [...names.keys()];
  if (eventIds.length === 0) return { tasks: [], run: [], payments: [] as TodayItem[] };
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const weekOut = new Date(now.getTime() + 7 * 86_400_000);
  const [tasks, run, payments] = await Promise.all([
    prisma.task.findMany({
      where: { eventId: { in: eventIds }, status: { not: 'DONE' }, dueAt: { lt: endOfDay } },
      orderBy: { dueAt: 'asc' },
      take: 30,
      select: { id: true, title: true, dueAt: true, eventId: true },
    }),
    prisma.runItem.findMany({
      where: { eventId: { in: eventIds }, startsAt: { gte: startOfDay, lt: endOfDay } },
      orderBy: { startsAt: 'asc' },
      take: 30,
      select: { id: true, title: true, startsAt: true, eventId: true, status: true },
    }),
    prisma.paymentMilestone.findMany({
      where: {
        booking: { eventId: { in: eventIds }, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
        state: { in: ['SCHEDULED', 'PENDING_PAYMENT', 'RECORDED_OFFLINE'] },
        dueAt: { lte: weekOut },
      },
      orderBy: { dueAt: 'asc' },
      take: 20,
      select: {
        id: true,
        label: true,
        dueAt: true,
        amountMinor: true,
        currency: true,
        booking: { select: { eventId: true, category: true } },
      },
    }),
  ]);
  const name = (eventId: string) => names.get(eventId) ?? '';
  return {
    tasks: tasks.map<TodayItem>((row) => ({
      id: row.id,
      kind: 'task',
      title: row.title,
      at: row.dueAt,
      eventId: row.eventId,
      eventName: name(row.eventId),
      overdue: row.dueAt != null && row.dueAt < startOfDay,
    })),
    run: run.map<TodayItem>((row) => ({
      id: row.id,
      kind: 'run',
      title: row.title,
      at: row.startsAt,
      eventId: row.eventId,
      eventName: name(row.eventId),
      overdue: (row.status === 'PLANNED' || row.status === 'LATE') && row.startsAt < now,
    })),
    payments: payments.map<TodayItem>((row) => ({
      id: row.id,
      kind: 'payment',
      title: `${row.label} · ${row.booking.category}`,
      at: row.dueAt,
      eventId: row.booking.eventId,
      eventName: name(row.booking.eventId),
      overdue: row.dueAt != null && row.dueAt < now,
      amountMinor: row.amountMinor,
      currency: row.currency,
    })),
  };
}
