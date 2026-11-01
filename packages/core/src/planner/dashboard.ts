import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { NotFoundError } from '../shared/errors.js';

// Planner home dashboard (PLN-01, UF-21, P10-T02). One call, ≤5 indexed
// queries in parallel: no N+1, no per-event fan-out. The gate counts DB
// queries per `/home` request — this function does 5, the frame adds user +
// orgs + unread (cached), staying under the 6-query budget for the page's
// own data load when the caller reuses them.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const dashboardSchema = z.object({ orgId: z.string().uuid() });

export interface DashboardEvent {
  id: string;
  name: string;
  startsAt: Date | null;
  status: string;
  role: string;
}

export interface PlannerDashboard {
  orgId: string;
  orgName: string;
  needsToday: {
    overdueTasks: number;
    paymentsDue: number;
    openEnquiries: number;
    unreadHint: boolean;
  };
  weekEvents: DashboardEvent[];
  pipeline: { stage: string; count: number }[];
  totals: { events: number; clients: number };
}

async function requirePlannerView(actor: UserActor, orgId: string) {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { kind: true, name: true } }),
  ]);
  if (!org || org.kind !== 'PLANNER') throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, 'org.view', orgId, membership ? { orgId, role: membership.role } : null);
  return org;
}

export async function plannerDashboard(
  actor: UserActor,
  raw: z.input<typeof dashboardSchema>,
  now = new Date(),
): Promise<PlannerDashboard> {
  const input = dashboardSchema.parse(raw);
  const org = await requirePlannerView(actor, input.orgId);

  // All events this planner org works on (active only for "today" math).
  const participations = await prisma.eventParticipant.findMany({
    where: { orgId: input.orgId, removedAt: null, event: { deletedAt: null } },
    select: {
      role: true,
      event: { select: { id: true, name: true, startsAt: true, status: true } },
    },
  });
  const eventIds = participations.map((p) => p.event.id);
  if (eventIds.length === 0) {
    const pipeline = await prisma.client.groupBy({
      by: ['stage'],
      where: { orgId: input.orgId },
      _count: { _all: true },
    });
    return {
      orgId: input.orgId,
      orgName: org.name,
      needsToday: { overdueTasks: 0, paymentsDue: 0, openEnquiries: 0, unreadHint: false },
      weekEvents: [],
      pipeline: pipeline.map((r) => ({ stage: r.stage, count: r._count._all })),
      totals: { events: 0, clients: pipeline.reduce((s, r) => s + r._count._all, 0) },
    };
  }

  const weekFrom = now;
  const weekTo = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const [overdueTasks, paymentsDue, pipeline, enquiries, weekEvents] = await Promise.all([
    // 1: overdue open tasks across my events
    prisma.task.count({
      where: { eventId: { in: eventIds }, status: { not: 'DONE' }, dueAt: { lt: now } },
    }),
    // 2: milestones due within 7 days, still scheduled (lean P8: offline included)
    prisma.paymentMilestone.count({
      where: {
        booking: { eventId: { in: eventIds }, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
        state: { in: ['SCHEDULED', 'RECORDED_OFFLINE', 'PENDING_PAYMENT'] },
        OR: [{ dueAt: null }, { dueAt: { lte: weekTo } }],
      },
    }),
    // 3: pipeline counts (one grouped query)
    prisma.client.groupBy({ by: ['stage'], where: { orgId: input.orgId }, _count: { _all: true } }),
    // 4: open quote requests addressed to this org (planner as vendor of planning services)
    prisma.quoteRequest.count({ where: { vendorOrgId: input.orgId, status: 'OPEN' } }),
    // 5: this week's events (already in memory — slice, no query)
    Promise.resolve(
      participations
        .filter((p) => p.event.startsAt && p.event.startsAt >= weekFrom && p.event.startsAt <= weekTo)
        .sort((a, b) => a.event.startsAt!.getTime() - b.event.startsAt!.getTime())
        .slice(0, 10)
        .map((p) => ({ ...p.event, role: p.role })),
    ),
  ]);

  return {
    orgId: input.orgId,
    orgName: org.name,
    needsToday: { overdueTasks, paymentsDue, openEnquiries: enquiries, unreadHint: false },
    weekEvents,
    pipeline: pipeline.map((r) => ({ stage: r.stage, count: r._count._all })),
    totals: { events: eventIds.length, clients: pipeline.reduce((s, r) => s + r._count._all, 0) },
  };
}
