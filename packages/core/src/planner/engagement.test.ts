// D-X47: client → event, planner fee agreement, and the Today view.
import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { createClient } from './clients.js';
import { plannerDashboard } from './dashboard.js';
import { plannerFeeMinor, plannerToday, setPlannerFee, startClientEvent } from './engagement.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
const events: string[] = [];
let orgId = '';
let planner: UserActor;
let outsider: UserActor;
const RUN = String(Date.now()).slice(-6);

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { kind: 'PLANNER', name: 'Engage Co', slug: `engage-${RUN}`, countryCode: 'NG' },
  });
  orgId = org.id;
  planner = await makeUser('Engage Planner');
  outsider = await makeUser('Engage Out');
  await prisma.membership.create({ data: { orgId, userId: planner.userId, role: 'OWNER' } });
});

afterAll(async () => {
  await prisma.task.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventDay.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.client.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe('planner engagement (D-X47)', () => {
  it('turns a client into a draft event linked to the planner org and marks them won', async () => {
    const client = await createClient(planner, { orgId, name: 'Adaeze Okafor' });
    const { eventId } = await startClientEvent(planner, { clientId: client.id, type: 'birthday' });
    events.push(eventId);
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.clientId).toBe(client.id);
    expect(event.name.startsWith('Adaeze Okafor')).toBe(true);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).stage).toBe('WON');
    const dash = await plannerDashboard(planner, { orgId });
    expect(dash.totals.events).toBe(1);
    await expect(startClientEvent(outsider, { clientId: client.id, type: 'birthday' })).rejects.toThrow();
  });

  it('records a fee as a share of budget plus a fixed part', async () => {
    const eventId = events[0]!;
    await prisma.event.update({ where: { id: eventId }, data: { plannedBudgetMinor: 1_000_000_00n } });
    const saved = await setPlannerFee(planner, { eventId, feeBps: 1000, feeMinor: '5000000' });
    expect(saved.totalMinor).toBe(100_000_00n + 50_000_00n);
    expect(plannerFeeMinor({ plannerFeeBps: null, plannerFeeMinor: null, plannedBudgetMinor: 1n })).toBeNull();
    await expect(setPlannerFee(planner, { eventId, feeBps: null, feeMinor: null })).rejects.toThrow();
    await expect(setPlannerFee(outsider, { eventId, feeBps: 1000, feeMinor: null })).rejects.toThrow();
  });

  it('lists overdue and due-today tasks across the org', async () => {
    const eventId = events[0]!;
    const now = new Date('2026-11-20T10:00:00Z');
    await prisma.task.createMany({
      data: [
        { eventId, title: 'Overdue cake', dueAt: new Date('2026-11-18T09:00:00Z') },
        { eventId, title: 'Today flowers', dueAt: new Date('2026-11-20T16:00:00Z') },
        { eventId, title: 'Next week', dueAt: new Date('2026-11-27T09:00:00Z') },
      ],
    });
    const today = await plannerToday(planner, orgId, now);
    expect(today.tasks.map((row) => row.title)).toEqual(['Overdue cake', 'Today flowers']);
    expect(today.tasks[0]!.overdue).toBe(true);
    await expect(plannerToday(outsider, orgId, now)).rejects.toThrow();
  });
});
