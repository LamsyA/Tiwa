import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { addGuests, createGroup } from './guests.js';
import { createInviteBatch, sendInviteBatch } from './batches.js';
import { enableInvites } from './invites.js';

const users: string[] = [];
const events: string[] = [];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

afterAll(async () => {
  await prisma.inviteDelivery.deleteMany({ where: { guest: { eventId: { in: events } } } });
  await prisma.inviteBatch.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guestGroup.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.idempotencyKey.deleteMany({ where: { scope: 'invite-batch' } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

async function eventWithGuests() {
  const host = await makeHost();
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  events.push(eventId);
  await enableInvites(host, { eventId, enabled: true });
  const { groupId } = await createGroup(host, { eventId, name: 'Family', color: null });
  await addGuests(host, {
    eventId,
    guests: [
      { name: 'Ada', phone: '08031234567', email: 'ada@example.com', groupIds: [groupId] },
      { name: 'Bob', email: 'bob@example.com', groupIds: [] },
      { name: 'No Contact', groupIds: [] },
    ],
  });
  return { host, eventId, groupId };
}

describe('createInviteBatch', () => {
  it('resolves smart channels, issues unique tokens, estimates SMS (UF-07-2)', async () => {
    const { host, eventId } = await eventWithGuests();
    const preview = await createInviteBatch(host, {
      eventId,
      audience: { type: 'all' },
      channels: ['WHATSAPP', 'EMAIL', 'SMS'],
      smart: true,
      message: 'You are invited!',
      kind: 'INVITE',
    });
    expect(preview.counts).toEqual({ WHATSAPP: 1, EMAIL: 1, SMS: 0, LINK: 0 });
    expect(preview.needsLink.map((row) => row.name)).toEqual(['No Contact']);
    expect(preview.needsLink[0]?.token).toBeTruthy();
    expect(preview.smsEstimateMinor).toBe(0);
    expect(preview.total).toBe(2);

    const guests = await prisma.guest.findMany({ where: { eventId }, select: { inviteToken: true } });
    const tokens = guests.map((guest) => guest.inviteToken).filter(Boolean);
    expect(tokens).toHaveLength(3);
    expect(new Set(tokens).size).toBe(3);
  });

  it('respects host channel order when smart is off, and group audiences', async () => {
    const { host, eventId, groupId } = await eventWithGuests();
    const preview = await createInviteBatch(host, {
      eventId,
      audience: { type: 'group', groupId },
      channels: ['SMS', 'WHATSAPP'],
      smart: false,
      message: 'Hi {name}',
      kind: 'INVITE',
    });
    expect(preview.counts).toEqual({ WHATSAPP: 0, EMAIL: 0, SMS: 1, LINK: 0 });
    expect(preview.total).toBe(1);
    // One SMS segment at the NG estimate.
    expect(preview.smsEstimateMinor).toBe(450);
  });

  it('requires invites on, a known group and a non-empty audience', async () => {
    const { host, eventId } = await eventWithGuests();
    await enableInvites(host, { eventId, enabled: false });
    await expect(
      createInviteBatch(host, {
        eventId,
        audience: { type: 'all' },
        channels: ['LINK'],
        smart: true,
        message: 'x',
        kind: 'INVITE',
      }),
    ).rejects.toThrow(/invitations on/);
    await enableInvites(host, { eventId, enabled: true });
    await expect(
      createInviteBatch(host, {
        eventId,
        audience: { type: 'group', groupId: '00000000-0000-0000-0000-000000000000' },
        channels: ['LINK'],
        smart: true,
        message: 'x',
        kind: 'INVITE',
      }),
    ).rejects.toThrow();
  });

  it('excludes already-invited guests from "all" (UF-07 step 2)', async () => {
    const { host, eventId } = await eventWithGuests();
    const first = await createInviteBatch(host, {
      eventId,
      audience: { type: 'all' },
      channels: ['LINK'],
      smart: true,
      message: 'x',
      kind: 'INVITE',
    });
    expect(first.total).toBe(3);
    await sendInviteBatch(host, { batchId: first.batchId, idempotencyKey: `t06-${Date.now()}-a` });
    await prisma.inviteDelivery.updateMany({ where: { batchId: first.batchId }, data: { status: 'SENT' } });
    await expect(
      createInviteBatch(host, {
        eventId,
        audience: { type: 'all' },
        channels: ['LINK'],
        smart: true,
        message: 'x',
        kind: 'INVITE',
      }),
    ).rejects.toThrow(/Nobody to send/);
    await prisma.outboxEvent.deleteMany({ where: { topic: 'invite.batch.queued' } });
  });
});

describe('sendInviteBatch', () => {
  it('sends once; replays return the original result; other keys are rejected', async () => {
    const { host, eventId } = await eventWithGuests();
    const preview = await createInviteBatch(host, {
      eventId,
      audience: { type: 'all' },
      channels: ['LINK'],
      smart: true,
      message: 'x',
      kind: 'INVITE',
    });
    const key = `t06-${Date.now()}-b`;
    const first = await sendInviteBatch(host, { batchId: preview.batchId, idempotencyKey: key });
    expect(first).toEqual({ batchId: preview.batchId, queued: 3, replayed: false });
    const replay = await sendInviteBatch(host, { batchId: preview.batchId, idempotencyKey: key });
    expect(replay).toEqual({ batchId: preview.batchId, queued: 3, replayed: true });
    await expect(sendInviteBatch(host, { batchId: preview.batchId, idempotencyKey: `${key}-other` })).rejects.toThrow(
      /already sent/,
    );
    const batch = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: preview.batchId } });
    expect(batch.status).toBe('QUEUED');
    await prisma.outboxEvent.deleteMany({ where: { topic: 'invite.batch.queued' } });
  });
});
