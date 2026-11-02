import { prisma } from '@tiwa/db';
import { PRESETS, createLogger, markRead, sendMessage, syncEventTeamThread, toStoredPermissions } from '@tiwa/core';
import { afterAll, describe, expect, it } from 'vitest';
import { handleChatNudges } from './chat-nudges.js';

// P13-T05: the worker turns unread threads into notifications, at most one
// per thread per hour, and stops once the thread is read.
const log = createLogger('test');
const users: string[] = [];
const events: string[] = [];

async function makeUser(name: string) {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

afterAll(async () => {
  const threads = await prisma.thread.findMany({
    where: { OR: [{ createdById: { in: users } }, { eventId: { in: events } }] },
    select: { id: true },
  });
  await prisma.thread.deleteMany({ where: { id: { in: threads.map((row) => row.id) } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } }).catch(() => undefined);
  await prisma.outboxEvent.deleteMany({ where: { topic: 'messaging/notify' } }).catch(() => undefined);
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: events } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
});

describe('chat/unread-nudges (P13-T05)', () => {
  it('notifies once per thread per hour, then stops after read', async () => {
    const host = await makeUser('Nudge Job Host');
    const cohost = await makeUser('Nudge Job Cohost');
    const event = await prisma.event.create({
      data: {
        slug: `nudge-job-${Date.now().toString(36)}`,
        type: 'birthday',
        format: 'PRIVATE_CELEBRATION',
        status: 'ACTIVE',
        name: 'Nudge Job Event',
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
        userId: cohost.userId,
        role: 'CO_HOST',
        permissions: toStoredPermissions(PRESETS.contributor),
      },
    });
    const { threadId } = await syncEventTeamThread(event.id);
    const { messageId } = await sendMessage(host, { threadId, clientMessageId: `nj-${Date.now()}`, body: 'Ping?' });
    const sentAt = (await prisma.message.findUniqueOrThrow({ where: { id: messageId } })).createdAt;
    const threeMin = new Date(sentAt.getTime() + 3 * 60_000);

    const before = await prisma.notification.count({ where: { userId: cohost.userId, type: 'chat.nudge' } });
    const first = await handleChatNudges(log, threeMin);
    expect(first.push).toBeGreaterThanOrEqual(1);
    const rows = await prisma.notification.findMany({ where: { userId: cohost.userId, type: 'chat.nudge' } });
    expect(rows).toHaveLength(before + 1);
    expect(rows[0]!.readAt).not.toBeNull(); // nudges skip the bell; the inbox badge is the surface

    const second = await handleChatNudges(log, threeMin);
    expect(second.push).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(1);

    await markRead(cohost, { threadId, upToMessageId: messageId });
    const afterCount = await prisma.notification.count({ where: { userId: cohost.userId, type: 'chat.nudge' } });
    await handleChatNudges(log, new Date(sentAt.getTime() + 30 * 60_000));
    expect(await prisma.notification.count({ where: { userId: cohost.userId, type: 'chat.nudge' } })).toBe(afterCount);
  });
});
