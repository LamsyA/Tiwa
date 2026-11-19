import { PLANNING_CATEGORY } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { proposalFromChat } from './requests.js';

// D-X101: chat first, then a proposal shaped to the conversation.
const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];
const threads: string[] = [];

async function user(name: string) {
  const row = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(row.id);
  return { kind: 'user' as const, userId: row.id, isAdmin: false };
}

afterAll(async () => {
  await prisma.threadParticipant.deleteMany({ where: { threadId: { in: threads } } });
  await prisma.thread.deleteMany({ where: { id: { in: threads } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.client.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ targetId: { in: events } }, { actorId: { in: users } }] } });
  await prisma.outboxEvent.deleteMany({
    where: { OR: events.map((id) => ({ payload: { path: ['eventId'], equals: id } })) },
  });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('proposal from chat (D-X101)', () => {
  it('a planner turns a chat with the host into an open planning request, once', async () => {
    const host = await user('Chat Host');
    const planner = await user('Chat Planner');
    const stranger = await user('Stranger');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const org = await prisma.organization.create({
      data: { kind: 'PLANNER', name: 'Chatty Events', slug: `chatty-${Date.now().toString(36)}`, countryCode: 'NG' },
    });
    orgs.push(org.id);
    await prisma.membership.create({ data: { orgId: org.id, userId: planner.userId, role: 'OWNER' } });
    const thread = await prisma.thread.create({
      data: {
        kind: 'DIRECT',
        context: 'PROFILE',
        eventId,
        createdById: host.userId,
        participants: {
          create: [
            { userId: host.userId, side: 'CLIENT' },
            { orgId: org.id, side: 'PLANNER' },
          ],
        },
      },
    });
    threads.push(thread.id);

    const first = await proposalFromChat(planner, { threadId: thread.id });
    expect(first.created).toBe(true);
    const request = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: first.requestId } });
    expect(request).toMatchObject({ eventId, vendorOrgId: org.id, category: PLANNING_CATEGORY, status: 'OPEN' });
    expect(request.createdById).toBe(host.userId);
    expect((request.brief as { fromThreadId?: string }).fromThreadId).toBe(thread.id);

    const again = await proposalFromChat(planner, { threadId: thread.id });
    expect(again).toEqual({ requestId: first.requestId, created: false });

    // Only the planner in that chat can do it.
    await expect(proposalFromChat(stranger, { threadId: thread.id })).rejects.toThrow();
    await expect(proposalFromChat(host, { threadId: thread.id })).rejects.toThrow();
  });
});
