import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { loadEventAccess } from '../events/access.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Planner team + calendar (PLN-05, PLN-07, P10-T05). Staff are org members
// (P2-T07); assignment is an EventParticipant with role PLANNER_STAFF and
// the planner orgId, so "who works which event" is one query. The calendar
// is the org's events sorted by date — no separate model.

type UserActor = Extract<Actor, { kind: 'user' }>;

async function requirePlanner(actor: UserActor, orgId: string, action: 'org.view' | 'org.manage') {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { kind: true, name: true } }),
  ]);
  if (!org || org.kind !== 'PLANNER') throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
  return org;
}

export const assignStaffSchema = z.object({
  orgId: z.string().uuid(),
  eventId: z.string().uuid(),
  userId: z.string().min(1),
});

export interface TeamAssignment {
  eventId: string;
  eventName: string;
  startsAt: Date | null;
  staff: { userId: string | null; orgId: string | null }[];
}

/** Every event this planner org works on, with assigned staff. */
export async function listTeamAssignments(actor: UserActor, orgId: string): Promise<TeamAssignment[]> {
  await requirePlanner(actor, orgId, 'org.view');
  const rows = await prisma.eventParticipant.findMany({
    where: { orgId, removedAt: null, event: { deletedAt: null } },
    select: {
      eventId: true,
      userId: true,
      orgId: true,
      role: true,
      event: { select: { name: true, startsAt: true } },
    },
    orderBy: { event: { startsAt: 'asc' } },
  });
  const byEvent = new Map<string, TeamAssignment>();
  for (const row of rows) {
    let entry = byEvent.get(row.eventId);
    if (!entry) {
      entry = { eventId: row.eventId, eventName: row.event.name, startsAt: row.event.startsAt, staff: [] };
      byEvent.set(row.eventId, entry);
    }
    if (row.role === 'PLANNER_STAFF') entry.staff.push({ userId: row.userId, orgId: row.orgId });
  }
  return [...byEvent.values()];
}

/** Assign a staff member (must belong to the planner org) to an event. */
export async function assignStaffToEvent(actor: UserActor, raw: z.input<typeof assignStaffSchema>) {
  const input = assignStaffSchema.parse(raw);
  await requirePlanner(actor, input.orgId, 'org.manage');
  const access = await loadEventAccess(actor.userId, input.eventId);
  if (!access) throw new NotFoundError('Event not found');
  const member = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: input.orgId, userId: input.userId } },
  });
  if (!member) throw new NotFoundError('Staff member not found');
  const existing = await prisma.eventParticipant.findFirst({
    where: { eventId: input.eventId, userId: input.userId, orgId: input.orgId, removedAt: null },
  });
  if (existing) throw new ConflictError('Already assigned', { reason: 'already-assigned' });
  return prisma.$transaction(async (tx) => {
    const row = await tx.eventParticipant.create({
      data: {
        eventId: input.eventId,
        userId: input.userId,
        orgId: input.orgId,
        role: 'PLANNER_STAFF',
        permissions: '{}',
        acceptedAt: new Date(),
      },
    });
    await audit(tx, {
      actor,
      action: 'planner.team.assign',
      targetType: 'Event',
      targetId: input.eventId,
      data: { orgId: input.orgId },
    });
    return row;
  });
}

export interface CalendarEvent {
  id: string;
  name: string;
  startsAt: Date | null;
  endsAt: Date | null;
  status: string;
  role: string;
}

/** Calendar across events (PLN-07): every non-deleted event the org works on. */
export async function plannerCalendar(actor: UserActor, orgId: string): Promise<CalendarEvent[]> {
  await requirePlanner(actor, orgId, 'org.view');
  const rows = await prisma.eventParticipant.findMany({
    where: { orgId, removedAt: null, event: { deletedAt: null } },
    select: {
      role: true,
      event: { select: { id: true, name: true, startsAt: true, endsAt: true, status: true } },
    },
    orderBy: { event: { startsAt: 'asc' } },
    take: 200,
  });
  return rows.map((r) => ({ ...r.event, role: r.role }));
}
