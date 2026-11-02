// P13-T02: the event activity history reads the audit trail, newest
// first, with money entries hidden from members without `money.view`.
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { PRESETS } from '../auth/presets.js';
import { toStoredPermissions } from './access.js';
import { uuidv7 } from '../shared/ids.js';
import { createTask, deleteTask } from './tasks.js';
import { eventActivity } from './activity.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const events: string[] = [];
const orgs: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

afterAll(async () => {
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: events } } }).catch(() => undefined);
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
});

describe('eventActivity (P13-T02)', () => {
  it('shows the audit trail newest-first with actor names', async () => {
    const host = await makeUser('Activity Host');
    const event = await prisma.event.create({
      data: {
        id: uuidv7(),
        slug: `activity-${Date.now().toString(36)}`,
        type: 'birthday',
        format: 'PRIVATE_CELEBRATION',
        status: 'ACTIVE',
        name: 'Activity Event',
        countryCode: 'NG',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        createdById: host.userId,
      },
    });
    events.push(event.id);
    await prisma.eventParticipant.create({
      data: { eventId: event.id, userId: host.userId, role: 'HOST', permissions: toStoredPermissions(PRESETS.full) },
    });
    const { taskId } = await createTask(host, { eventId: event.id, title: 'Order the cake' });
    await deleteTask(host, { eventId: event.id, taskId });
    const { entries } = await eventActivity(host, event.id);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]!.actorName).toBe('Activity Host');
    expect(entries.some((row) => row.action === 'event.task.delete')).toBe(true);
  });

  it('hides money entries from members without money.view', async () => {
    const host = await makeUser('Money Host');
    const vendorUser = await makeUser('Money Vendor');
    const org = await prisma.organization.create({
      data: {
        kind: 'VENDOR',
        name: 'Money Catering',
        slug: `money-cat-${Date.now().toString(36)}`,
        countryCode: 'NG',
      },
    });
    orgs.push(org.id);
    const event = await prisma.event.create({
      data: {
        id: uuidv7(),
        slug: `money-${Date.now().toString(36)}`,
        type: 'birthday',
        format: 'PRIVATE_CELEBRATION',
        status: 'ACTIVE',
        name: 'Money Event',
        countryCode: 'NG',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        createdById: host.userId,
      },
    });
    events.push(event.id);
    await prisma.eventParticipant.create({
      data: { eventId: event.id, userId: host.userId, role: 'HOST', permissions: toStoredPermissions(PRESETS.full) },
    });
    await prisma.eventParticipant.create({
      data: {
        eventId: event.id,
        userId: vendorUser.userId,
        orgId: org.id,
        role: 'VENDOR',
        permissions: toStoredPermissions(PRESETS.view_only),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: host.userId,
        actorType: 'user',
        action: 'money.allocations.set',
        targetType: 'Event',
        targetId: event.id,
        data: { eventId: event.id },
      },
    });
    const vendorView = await eventActivity(vendorUser, event.id);
    expect(vendorView.entries.some((row) => row.action.startsWith('money.'))).toBe(false);
    const hostView = await eventActivity(host, event.id);
    expect(hostView.entries.some((row) => row.action === 'money.allocations.set')).toBe(true);
  });
});
