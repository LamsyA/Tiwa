// P13-T02: team decisions surface on the event record.
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { PRESETS } from '../auth/presets.js';
import { toStoredPermissions } from '../events/access.js';
import { uuidv7 } from '../shared/ids.js';
import { eventDecisions } from './decisions.js';
import { markDecision, sendMessage, syncEventTeamThread } from './threads.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeEvent(host: UserActor): Promise<string> {
  const event = await prisma.event.create({
    data: {
      id: uuidv7(),
      slug: `decisions-${Date.now().toString(36)}-${events.length}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'ACTIVE',
      name: 'Decision Event',
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
  return event.id;
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

describe('eventDecisions (P13-T02)', () => {
  it('lists flagged team messages newest-first; outsiders see nothing', async () => {
    const host = await makeUser('Decision Host');
    const cohost = await makeUser('Decision Cohost');
    const eventId = await makeEvent(host);
    await prisma.eventParticipant.create({
      data: {
        eventId,
        userId: cohost.userId,
        role: 'CO_HOST',
        permissions: toStoredPermissions(PRESETS.contributor),
      },
    });
    const { threadId } = await syncEventTeamThread(eventId);
    const first = await sendMessage(host, { threadId, clientMessageId: `d-${Date.now()}-1`, body: 'Jollof wins' });
    const second = await sendMessage(cohost, { threadId, clientMessageId: `d-${Date.now()}-2`, body: 'Live band' });
    await markDecision(host, { messageId: first.messageId });
    await markDecision(host, { messageId: second.messageId });

    const decisions = await eventDecisions(host, eventId);
    expect(decisions.map((row) => row.body)).toEqual(['Live band', 'Jollof wins']);
    expect(decisions[0]!.authorName).toBe('Decision Cohost');

    // Non-decision chatter and deleted flags stay out.
    await markDecision(host, { messageId: second.messageId, decision: false });
    expect((await eventDecisions(host, eventId)).map((row) => row.body)).toEqual(['Jollof wins']);

    const outsider = await makeUser('Decision Outsider');
    await expect(eventDecisions(outsider, eventId)).rejects.toThrow();
  });

  it('returns empty when the team never pinned anything', async () => {
    const host = await makeUser('Quiet Host');
    const eventId = await makeEvent(host);
    await syncEventTeamThread(eventId);
    await expect(eventDecisions(host, eventId)).resolves.toEqual([]);
  });
});
