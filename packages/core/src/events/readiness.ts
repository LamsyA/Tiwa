import { prisma } from '@tiwa/db';
import type { Actor } from '../auth/authorize.js';
import { loadEventAccess } from './access.js';
import { NotFoundError } from '../shared/errors.js';

// Guided setup (D-X45): the host's "next things to do" checklist on the
// event overview. Each step is read from real data, so it ticks itself as
// the host works; invites only count when the event uses them.

type UserActor = Extract<Actor, { kind: 'user' }>;

export type ReadinessKey = 'budget' | 'plan' | 'vendors' | 'guests' | 'invites' | 'day';

export interface ReadinessStep {
  key: ReadinessKey;
  done: boolean;
  path: string;
}

export interface EventReadiness {
  steps: ReadinessStep[];
  done: number;
  total: number;
}

export async function eventReadiness(actor: UserActor, eventId: string): Promise<EventReadiness> {
  const access = await loadEventAccess(actor.userId, eventId);
  if (!access) throw new NotFoundError('Event not found');
  const [event, categories, tasks, quotes, bookings, guests, batches, runItems] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { plannedBudgetMinor: true, invitesEnabled: true },
    }),
    prisma.budgetCategory.count({ where: { eventId, plannedMinor: { gt: 0 } } }),
    prisma.task.count({ where: { eventId } }),
    prisma.quoteRequest.count({ where: { eventId } }),
    prisma.booking.count({ where: { eventId } }),
    prisma.guest.count({ where: { eventId, deletedAt: null } }),
    prisma.inviteBatch.count({ where: { eventId, status: { in: ['QUEUED', 'SENDING', 'DONE'] } } }),
    prisma.runItem.count({ where: { eventId } }),
  ]);
  const steps: ReadinessStep[] = [
    { key: 'budget', done: event.plannedBudgetMinor > 0n || categories > 0, path: '/money' },
    { key: 'plan', done: tasks > 0, path: '/plan' },
    { key: 'vendors', done: quotes + bookings > 0, path: '/vendors' },
    { key: 'guests', done: guests > 0, path: '/guests' },
    ...(event.invitesEnabled ? [{ key: 'invites' as const, done: batches > 0, path: '/invites' }] : []),
    { key: 'day', done: runItems > 0, path: '/day' },
  ];
  return { steps, done: steps.filter((step) => step.done).length, total: steps.length };
}
