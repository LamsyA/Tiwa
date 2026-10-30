import { prisma, type EventRole, type Prisma } from '@tiwa/db';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from './access.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

export type EventListTab = 'upcoming' | 'past' | 'drafts';

export interface EventCard {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: Date | null;
  timezone: string;
  coverKey: string | null;
  themeColor: string | null;
  role: EventRole;
  wizardStep: string | null;
  progress: { done: number; total: number };
}

/** `/events` tabs (P3-T06). Upcoming = active and not yet over; past = over, completed or cancelled. */
export async function listMyEvents(userId: string, tab: EventListTab, now = new Date()): Promise<EventCard[]> {
  const mine: Prisma.EventWhereInput = {
    deletedAt: null,
    participants: { some: { userId, removedAt: null } },
  };
  const where: Prisma.EventWhereInput =
    tab === 'drafts'
      ? { ...mine, status: 'DRAFT' }
      : tab === 'upcoming'
        ? { ...mine, status: 'ACTIVE', OR: [{ startsAt: null }, { startsAt: { gte: startOfToday(now) } }] }
        : {
            ...mine,
            OR: [
              { status: { in: ['COMPLETED', 'CANCELLED'] } },
              { status: 'ACTIVE', startsAt: { lt: startOfToday(now) } },
            ],
          };
  const events = await prisma.event.findMany({
    where,
    orderBy: tab === 'past' ? { startsAt: 'desc' } : tab === 'drafts' ? { updatedAt: 'desc' } : { startsAt: 'asc' },
    take: 50,
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      startsAt: true,
      timezone: true,
      coverKey: true,
      themeColor: true,
      wizardStep: true,
      participants: { where: { userId, removedAt: null }, select: { role: true }, take: 1 },
    },
  });
  if (events.length === 0) return [];
  // One grouped query for progress across all cards (no N+1).
  const counts = await prisma.task.groupBy({
    by: ['eventId', 'status'],
    where: { eventId: { in: events.map((event) => event.id) } },
    _count: { _all: true },
  });
  return events.map((event) => {
    const rows = counts.filter((row) => row.eventId === event.id);
    const total = rows.reduce((sum, row) => sum + row._count._all, 0);
    const done = rows.find((row) => row.status === 'DONE')?._count._all ?? 0;
    const { participants, ...rest } = event;
    return { ...rest, role: participants[0]?.role ?? 'HOST', progress: { done, total } };
  });
}

function startOfToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface EventProgress {
  total: number;
  done: number;
  outstanding: number;
  overdue: number;
  blocked: number;
}

/** EVT-05: the overview's progress, next 5 deadlines and team. Pass `preloaded` access to skip re-loading it. */
export async function getEventOverview(actor: UserActor, eventId: string, now = new Date(), preloaded?: EventAccess) {
  const access = await resolveEventAccess(actor, eventId, 'event.view', preloaded);
  const [event, statusCounts, overdue, deadlines, team] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: { days: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.task.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } }),
    prisma.task.count({ where: { eventId, status: { not: 'DONE' }, dueAt: { lt: now } } }),
    prisma.task.findMany({
      where: { eventId, status: { not: 'DONE' }, dueAt: { not: null } },
      orderBy: { dueAt: 'asc' },
      take: 5,
      select: { id: true, title: true, dueAt: true, status: true, priority: true },
    }),
    prisma.eventParticipant.findMany({
      where: { eventId, removedAt: null, userId: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { role: true, acceptedAt: true, user: { select: { id: true, name: true, phone: true, image: true } } },
    }),
  ]);
  const count = (status: string) => statusCounts.find((row) => row.status === status)?._count._all ?? 0;
  const total = statusCounts.reduce((sum, row) => sum + row._count._all, 0);
  const progress: EventProgress = {
    total,
    done: count('DONE'),
    outstanding: total - count('DONE'),
    overdue,
    blocked: count('BLOCKED'),
  };
  return {
    event,
    myRole: access.role,
    permissions: access.permissions,
    progress,
    deadlines,
    team: team.map((member) => ({
      userId: member.user?.id ?? '',
      // Placeholder accounts and phone sign-ups carry no real name yet.
      name: member.user?.name && member.user.name !== member.user.phone ? member.user.name : null,
      image: member.user?.image ?? null,
      role: member.role,
      joined: member.acceptedAt !== null,
    })),
  };
}
