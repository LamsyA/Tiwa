// D-X45: the guided-setup checklist ticks itself from real event data.
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { PRESETS } from '../auth/presets.js';
import { toStoredPermissions } from './access.js';
import { uuidv7 } from '../shared/ids.js';
import { createTask } from './tasks.js';
import { eventReadiness } from './readiness.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const events: string[] = [];

afterAll(async () => {
  await prisma.task.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: events } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
});

describe('eventReadiness (D-X45)', () => {
  it('starts empty, ticks steps from data, and hides invites when off', async () => {
    const user = await prisma.user.create({ data: { name: 'Ready Host', countryCode: 'NG' } });
    users.push(user.id);
    const host: UserActor = { kind: 'user', userId: user.id, isAdmin: false };
    const event = await prisma.event.create({
      data: {
        id: uuidv7(),
        slug: `ready-${Date.now().toString(36)}`,
        type: 'birthday',
        format: 'PRIVATE_CELEBRATION',
        status: 'ACTIVE',
        name: 'Ready Event',
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

    const before = await eventReadiness(host, event.id);
    expect(before.done).toBe(0);
    expect(before.steps.map((step) => step.key)).not.toContain('invites');

    await prisma.event.update({
      where: { id: event.id },
      data: { plannedBudgetMinor: 50_000_00n, invitesEnabled: true },
    });
    await createTask(host, { eventId: event.id, title: 'Book the hall' });
    const after = await eventReadiness(host, event.id);
    expect(after.steps.find((step) => step.key === 'budget')?.done).toBe(true);
    expect(after.steps.find((step) => step.key === 'plan')?.done).toBe(true);
    expect(after.steps.map((step) => step.key)).toContain('invites');
    expect(after.done).toBe(2);
  });

  it('is NOT_FOUND for someone outside the event', async () => {
    const stranger = await prisma.user.create({ data: { name: 'Stranger', countryCode: 'NG' } });
    users.push(stranger.id);
    await expect(eventReadiness({ kind: 'user', userId: stranger.id, isAdmin: false }, events[0]!)).rejects.toThrow(
      'Event not found',
    );
  });
});
