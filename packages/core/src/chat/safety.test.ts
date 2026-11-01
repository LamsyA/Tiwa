import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { ForbiddenError, ValidationError } from '../shared/errors.js';
import { listInbox, listMessages } from './inbox.js';
import { MASK } from './masking.js';
import { blockParty, reportMessage, unblockParty } from './safety.js';
import { sendMessage, startThread } from './threads.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const RUN = String(Date.now()).slice(-7);
const users: string[] = [];
const orgs: string[] = [];
let seq = 0;
const cid = () => `saf-${RUN}-${(seq += 1)}`;
const actor = (userId: string): UserActor => ({ kind: 'user', userId, isAdmin: false });

async function pair(hostCreatedAt?: Date) {
  const host = await prisma.user.create({
    data: { name: 'Host', countryCode: 'NG', ...(hostCreatedAt ? { createdAt: hostCreatedAt } : {}) },
  });
  const owner = await prisma.user.create({ data: { name: 'Owner', countryCode: 'NG' } });
  users.push(host.id, owner.id);
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'Vendor', slug: `saf-${RUN}-${orgs.length}`, countryCode: 'NG' },
  });
  orgs.push(org.id);
  await prisma.membership.create({ data: { orgId: org.id, userId: owner.id, role: 'OWNER' } });
  return { host: actor(host.id), owner: actor(owner.id), orgId: org.id };
}

afterAll(async () => {
  await prisma.report.deleteMany({ where: { reporterUserId: { in: users } } });
  await prisma.userBlock.deleteMany({
    where: { OR: [{ blockerUserId: { in: users } }, { blockerOrgId: { in: orgs } }] },
  });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.thread.deleteMany({ where: { createdById: { in: users } } });
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('contact masking at send (§9a.3)', () => {
  it('warns first; once acknowledged the vendor sees the masked text and the sender the original', async () => {
    const { host, owner, orgId } = await pair();
    const body = 'Call me on 08031234567 to discuss';
    await expect(
      startThread(host, { context: 'PROFILE', toOrgId: orgId, firstMessage: { clientMessageId: cid(), body } }),
    ).rejects.toMatchObject({ code: 'VALIDATION', details: { key: 'contactWarning' } });

    const { threadId } = await startThread(host, {
      context: 'PROFILE',
      toOrgId: orgId,
      firstMessage: { clientMessageId: cid(), body, acknowledgeContactWarning: true },
    });
    const forVendor = (await listMessages(owner, threadId)).messages[0];
    expect(forVendor).toMatchObject({ body: `Call me on ${MASK} to discuss`, masked: true });
    const forHost = (await listMessages(host, threadId)).messages[0];
    expect(forHost).toMatchObject({ body, masked: false });
    expect((await listInbox(owner)).find((r) => r.threadId === threadId)?.lastMessage?.body).toContain(MASK);
    expect(await prisma.auditLog.count({ where: { actorId: host.userId, action: 'chat.contact_shared' } })).toBe(1);

    // Replies are scanned too.
    await expect(
      sendMessage(owner, { threadId, clientMessageId: cid(), body: 'Email me: bisi@example.com' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('event-team threads are never masked', async () => {
    const { host } = await pair();
    const thread = await prisma.thread.create({
      data: {
        kind: 'EVENT',
        context: 'EVENT_TEAM',
        createdById: host.userId,
        participants: { create: [{ userId: host.userId, side: 'TEAM' }] },
      },
    });
    const { messageId } = await sendMessage(host, {
      threadId: thread.id,
      clientMessageId: cid(),
      body: 'My line: 08031234567',
    });
    expect((await prisma.message.findUniqueOrThrow({ where: { id: messageId } })).maskedBody).toBeNull();
  });
});

describe('new accounts (§9a.6)', () => {
  it('refuse links in a first message; older accounts may send them', async () => {
    const fresh = await pair();
    await expect(
      startThread(fresh.host, {
        context: 'PROFILE',
        toOrgId: fresh.orgId,
        firstMessage: { clientMessageId: cid(), body: 'See https://example.com/brief' },
      }),
    ).rejects.toMatchObject({ details: { key: 'linkInFirstMessage' } });

    const veteran = await pair(new Date(Date.now() - 30 * 86_400_000));
    await expect(
      startThread(veteran.host, {
        context: 'PROFILE',
        toOrgId: veteran.orgId,
        firstMessage: { clientMessageId: cid(), body: 'See https://example.com/brief' },
      }),
    ).resolves.toMatchObject({ reused: false });
  });
});

describe('block and report', () => {
  it('a business blocks a client: no new thread, no replies; unblock restores', async () => {
    const { host, owner, orgId } = await pair();
    const { threadId } = await startThread(host, {
      context: 'PROFILE',
      toOrgId: orgId,
      firstMessage: { clientMessageId: cid(), body: 'Hello' },
    });
    await blockParty(owner, { asOrgId: orgId, userId: host.userId, reason: 'spam' });
    await expect(sendMessage(host, { threadId, clientMessageId: cid(), body: 'Hi?' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      startThread(host, {
        context: 'PROFILE',
        toOrgId: orgId,
        firstMessage: { clientMessageId: cid(), body: 'again' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await unblockParty(owner, { asOrgId: orgId, userId: host.userId });
    await expect(sendMessage(host, { threadId, clientMessageId: cid(), body: 'Back' })).resolves.toBeTruthy();
  });

  it('staff cannot block for the business; nobody can block themselves', async () => {
    const { host, orgId } = await pair();
    const staff = await prisma.user.create({ data: { name: 'Staff', countryCode: 'NG' } });
    users.push(staff.id);
    await prisma.membership.create({ data: { orgId, userId: staff.id, role: 'STAFF' } });
    await expect(blockParty(actor(staff.id), { asOrgId: orgId, userId: host.userId })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(blockParty(host, { userId: host.userId })).rejects.toBeInstanceOf(ValidationError);
  });

  it('participants report others’ messages once; not their own', async () => {
    const { host, owner, orgId } = await pair();
    const { messageId } = await startThread(host, {
      context: 'PROFILE',
      toOrgId: orgId,
      firstMessage: { clientMessageId: cid(), body: 'Hello' },
    });
    const first = await reportMessage(owner, { messageId, reason: 'abusive language' });
    expect((await reportMessage(owner, { messageId, reason: 'again' })).reportId).toBe(first.reportId);
    await expect(reportMessage(host, { messageId, reason: 'my own' })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.report.count({ where: { targetType: 'message', targetId: messageId } })).toBe(1);
  });
});
