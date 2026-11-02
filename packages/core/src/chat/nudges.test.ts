// P13-T05: unread threads surface as push nudges after 2 min and as
// summaries after 15 min; reads and mutes suppress them.
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { PRESETS } from '../auth/presets.js';
import { toStoredPermissions } from '../events/access.js';
import { findNudgeCandidates } from './nudges.js';
import { markRead, muteThread, sendMessage, syncEventTeamThread } from './threads.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeTeam(): Promise<{ host: UserActor; cohost: UserActor; eventId: string; threadId: string }> {
  const host = await makeUser('Nudge Host');
  const cohost = await makeUser('Nudge Cohost');
  const event = await prisma.event.create({
    data: {
      slug: `nudge-${Date.now().toString(36)}-${events.length}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'ACTIVE',
      name: 'Nudge Event',
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
    data: { eventId: event.id, userId: cohost.userId, role: 'CO_HOST', permissions: toStoredPermissions(PRESETS.contributor) },
  });
  const { threadId } = await syncEventTeamThread(event.id);
  return { host, cohost, eventId: event.id, threadId };
}

afterAll(async () => {
  const threads = await prisma.thread.findMany({
    where: { OR: [{ createdById: { in: users } }, { eventId: { in: events } }] },
    select: { id: true },
  });
  await prisma.thread.deleteMany({ where: { id: { in: threads.map((row) => row.id) } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe('findNudgeCandidates (P13-T05)', () => {
  it('pushes after 2 min unread and summarizes after 15', async () => {
    const { host, cohost, threadId } = await makeTeam();
    const { messageId } = await sendMessage(host, { threadId, clientMessageId: `n-${Date.now()}`, body: 'Cake time?' });
    const sentAt = (await prisma.message.findUniqueOrThrow({ where: { id: messageId } })).createdAt;
    // The shared dev DB holds other threads; only assert on ours.
    const ours = (rows: Awaited<ReturnType<typeof findNudgeCandidates>>) =>
      rows.filter((row) => row.threadId === threadId);

    expect(ours(await findNudgeCandidates(new Date(sentAt.getTime() + 60_000)))).toEqual([]);
    const push = ours(await findNudgeCandidates(new Date(sentAt.getTime() + 3 * 60_000)));
    expect(push).toHaveLength(1);
    expect(push[0]).toMatchObject({ userId: cohost.userId, kind: 'push', unreadCount: 1, senderName: 'Nudge Host' });

    const summary = ours(await findNudgeCandidates(new Date(sentAt.getTime() + 16 * 60_000)));
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ userId: cohost.userId, kind: 'summary' });

    await markRead(cohost, { threadId, upToMessageId: messageId });
    expect(ours(await findNudgeCandidates(new Date(sentAt.getTime() + 30 * 60_000)))).toEqual([]);
  });

  it('skips muted threads', async () => {
    const { host, cohost, threadId } = await makeTeam();
    const { messageId } = await sendMessage(host, { threadId, clientMessageId: `m-${Date.now()}`, body: 'Quiet?' });
    await muteThread(cohost, { threadId, until: new Date(Date.now() + 60 * 60_000).toISOString() });
    const sentAt = (await prisma.message.findUniqueOrThrow({ where: { id: messageId } })).createdAt;
    const ours = await findNudgeCandidates(new Date(sentAt.getTime() + 30 * 60_000));
    expect(ours.filter((row) => row.threadId === threadId && row.userId === cohost.userId)).toEqual([]);
  });
});
