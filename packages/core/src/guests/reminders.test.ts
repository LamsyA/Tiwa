import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { addGuests } from './guests.js';
import { enableInvites } from './invites.js';
import { findDueReminders, sendUpdate, setReminderPolicy, toggleForwarding } from './reminders.js';

const users: string[] = [];
const events: string[] = [];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function eventWithGuests(startsAt: Date) {
  const host = await makeHost();
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  events.push(eventId);
  await enableInvites(host, { eventId, enabled: true });
  await prisma.event.update({ where: { id: eventId }, data: { startsAt } });
  await addGuests(host, { eventId, guests: [{ name: 'Ada', phone: '08031234567', groupIds: [] }] });
  return { host, eventId };
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

describe('findDueReminders', () => {
  it('nudges non-responders at ~3 days, finally day-before, max 2', async () => {
    const now = new Date('2031-01-01T12:00:00Z');
    const { eventId } = await eventWithGuests(new Date('2031-01-04T11:00:00Z')); // 2d23h out: first window
    const due = await findDueReminders(now);
    expect(due.map((row) => row.eventId)).toContain(eventId);
    expect(due.find((row) => row.eventId === eventId)?.isFinal).toBe(false);

    // Record the first reminder; the same window must not re-fire.
    await prisma.guest.updateMany({ where: { eventId }, data: { remindersSent: 1 } });
    const again = await findDueReminders(now);
    expect(again.find((row) => row.eventId === eventId)).toBeUndefined();

    // Day-before window fires the final nudge (remindersSent 1 -> 2).
    const final = await findDueReminders(new Date('2031-01-03T12:00:00Z'));
    expect(final.find((row) => row.eventId === eventId)?.isFinal).toBe(true);

    // Max 2: after the second, silence.
    await prisma.guest.updateMany({ where: { eventId }, data: { remindersSent: 2 } });
    expect(await findDueReminders(new Date('2031-01-03T12:00:00Z'))).toEqual([]);
  });

  it('skips responders, distant events and reminders-off events', async () => {
    const now = new Date('2031-01-01T12:00:00Z');
    const { host, eventId } = await eventWithGuests(new Date('2031-01-20T12:00:00Z')); // too far
    expect(await findDueReminders(now)).toEqual([]);

    await prisma.guest.updateMany({ where: { eventId }, data: { rsvp: 'YES' } });
    await prisma.event.update({ where: { id: eventId }, data: { startsAt: new Date('2031-01-02T12:00:00Z') } });
    expect(await findDueReminders(now)).toEqual([]);

    await prisma.guest.updateMany({ where: { eventId }, data: { rsvp: 'NONE' } });
    await setReminderPolicy(host, { eventId, enabled: false });
    expect(await findDueReminders(now)).toEqual([]);
    await setReminderPolicy(host, { eventId, enabled: true });
    expect((await findDueReminders(now)).map((row) => row.eventId)).toContain(eventId);
  });
});

describe('sendUpdate', () => {
  it('sends an UPDATE batch to attending guests, idempotently', async () => {
    const { host, eventId } = await eventWithGuests(new Date('2031-02-01T12:00:00Z'));
    await prisma.guest.updateMany({ where: { eventId }, data: { rsvp: 'YES' } });
    const key = `t11-${Date.now()}-a`;
    const first = await sendUpdate(host, {
      eventId,
      audience: { type: 'attending' },
      channels: ['SMS'],
      smart: true,
      message: 'Doors open at 5, not 4! {link}',
      idempotencyKey: key,
    });
    expect(first.queued).toBe(1);
    expect(first.replayed).toBe(false);
    const batch = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: first.batchId } });
    expect(batch.kind).toBe('UPDATE');
    const replay = await sendUpdate(host, {
      eventId,
      audience: { type: 'attending' },
      channels: ['SMS'],
      smart: true,
      message: 'Doors open at 5, not 4! {link}',
      idempotencyKey: key,
    });
    expect(replay.batchId).toBe(first.batchId);
    await prisma.outboxEvent.deleteMany({ where: { topic: 'invite.batch.queued' } });
  });

  it('requires guests.manage and a non-empty audience', async () => {
    const { host, eventId } = await eventWithGuests(new Date('2031-02-01T12:00:00Z'));
    const viewer = await prisma.user.create({ data: { name: 'Viewer', countryCode: 'NG' } });
    users.push(viewer.id);
    await expect(
      sendUpdate(
        { kind: 'user', userId: viewer.id, isAdmin: false },
        {
          eventId,
          audience: { type: 'all' },
          channels: ['LINK'],
          smart: true,
          message: 'x',
          idempotencyKey: `t11-${Date.now()}-b`,
        },
      ),
    ).rejects.toThrow();
    await prisma.guest.deleteMany({ where: { eventId } });
    await expect(
      sendUpdate(host, {
        eventId,
        audience: { type: 'attending' },
        channels: ['LINK'],
        smart: true,
        message: 'x',
        idempotencyKey: `t11-${Date.now()}-c`,
      }),
    ).rejects.toThrow(/Nobody/);
  });
});

describe('policies', () => {
  it('toggles reminders and forwarding', async () => {
    const { host, eventId } = await eventWithGuests(new Date('2031-02-01T12:00:00Z'));
    expect(await toggleForwarding(host, { eventId, enabled: false })).toEqual({ enabled: false });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).allowForwarding).toBe(false);
    expect(await toggleForwarding(host, { eventId, enabled: true })).toEqual({ enabled: true });
  });
});
