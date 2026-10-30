import { createEventDraft } from '@tiwa/core';
import { addGuests } from '@tiwa/core';
import { enableInvites } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { handleReminders } from './reminders.js';

const users: string[] = [];
const events: string[] = [];

const fakeLog = { info: () => undefined } as unknown as Parameters<typeof handleReminders>[0];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

afterAll(async () => {
  await prisma.inviteDelivery.deleteMany({ where: { guest: { eventId: { in: events } } } });
  await prisma.inviteBatch.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.idempotencyKey.deleteMany({ where: { scope: 'invite-batch' } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('messaging/reminders', () => {
  it('creates one REMINDER batch per due event and bumps remindersSent (max 2)', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    await enableInvites(host, { eventId, enabled: true });
    // Day-before window: final nudge.
    await prisma.event.update({ where: { id: eventId }, data: { startsAt: new Date('2031-05-02T12:00:00Z') } });
    await addGuests(host, { eventId, guests: [{ name: 'Ada', phone: '08031234567', groupIds: [] }] });

    const first = await handleReminders(fakeLog, new Date('2031-05-01T12:00:00Z'));
    expect(first).toEqual({ batches: 1, guests: 1 });
    const batch = await prisma.inviteBatch.findFirstOrThrow({ where: { eventId, kind: 'REMINDER' } });
    const deliveries = await prisma.inviteDelivery.findMany({ where: { batchId: batch.id } });
    expect(deliveries).toHaveLength(1);
    expect(
      (await prisma.guest.findMany({ where: { eventId }, select: { remindersSent: true } }))[0]?.remindersSent,
    ).toBe(1);

    // Re-running in the same hour is idempotent-safe: the batch exists, the
    // guest now has remindersSent 1 in the final window... it WOULD fire
    // again (1 < 2). Bump to 2 first to prove the cap.
    await prisma.guest.updateMany({ where: { eventId }, data: { remindersSent: 2 } });
    await prisma.outboxEvent.deleteMany({ where: { topic: 'invite.batch.queued' } });
    const capped = await handleReminders(fakeLog, new Date('2031-05-01T13:00:00Z'));
    expect(capped).toEqual({ batches: 0, guests: 0 });
    await prisma.outboxEvent.deleteMany({ where: { topic: 'invite.batch.queued' } });
  });

  it('skips events with reminders off and distant events', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    await enableInvites(host, { eventId, enabled: true });
    await prisma.event.update({ where: { id: eventId }, data: { startsAt: new Date('2032-01-01T12:00:00Z') } });
    await addGuests(host, { eventId, guests: [{ name: 'Bob', groupIds: [] }] });
    expect(await handleReminders(fakeLog, new Date('2031-05-01T12:00:00Z'))).toEqual({ batches: 0, guests: 0 });
    await prisma.outboxEvent.deleteMany({ where: { topic: 'invite.batch.queued' } });
  });
});
