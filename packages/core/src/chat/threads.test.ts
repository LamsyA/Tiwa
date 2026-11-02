import { prisma } from '@tiwa/db';
import { notifyNewMessage } from './notify-message.js';
import { threadPresence, touchPresence } from './presence.js';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { PRESETS } from '../auth/presets.js';
import { toStoredPermissions } from '../events/access.js';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';
import { listInbox, listMessages, unreadTotal } from './inbox.js';
import {
  archiveThread,
  deleteMessage,
  editMessage,
  markDecision,
  markRead,
  sendMessage,
  startThread,
  syncEventTeamThread,
} from './threads.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const RUN = String(Date.now()).slice(-7);
const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];
let seq = 0;
const cid = () => `c-${RUN}-${(seq += 1)}`;

async function makeUser(name: string, extra: { phone?: string; phoneVerified?: boolean } = {}): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG', ...extra } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeVendor(name: string, ownerName = `${name} owner`) {
  const owner = await makeUser(ownerName);
  const org = await prisma.organization.create({
    data: {
      kind: 'VENDOR',
      name,
      slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${RUN}-${orgs.length}`,
      countryCode: 'NG',
    },
  });
  orgs.push(org.id);
  await prisma.membership.create({ data: { orgId: org.id, userId: owner.userId, role: 'OWNER' } });
  return { orgId: org.id, owner };
}

async function makeEvent(host: UserActor, when: Date) {
  const event = await prisma.event.create({
    data: {
      slug: `chat-${RUN}-${events.length}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'ACTIVE',
      name: "Ada's 40th",
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      startsAt: when,
      endsAt: new Date(when.getTime() + 5 * 3600_000),
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
  await prisma.thread.deleteMany({ where: { id: { in: threads.map((t) => t.id) } } });
  await prisma.userBlock.deleteMany({
    where: { OR: [{ blockerUserId: { in: users } }, { blockerOrgId: { in: orgs } }] },
  });
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('startThread (UF-30 steps 1–2)', () => {
  it('client → vendor opens a thread; a second start reuses it; the vendor may reply', async () => {
    const host = await makeUser('Ada');
    const vendor = await makeVendor('Bisi Chops');
    const eventId = await makeEvent(host, new Date('2031-01-10T17:00:00Z'));

    const first = await startThread(host, {
      context: 'PROFILE',
      toOrgId: vendor.orgId,
      eventId,
      firstMessage: { clientMessageId: cid(), body: 'Are you free on 10 Jan for 150 guests?' },
    });
    expect(first.reused).toBe(false);
    const again = await startThread(host, {
      context: 'PROFILE',
      toOrgId: vendor.orgId,
      eventId,
      firstMessage: { clientMessageId: cid(), body: 'Following up' },
    });
    expect(again).toMatchObject({ threadId: first.threadId, reused: true });

    // The vendor sees it in the business inbox and replies on behalf of the business.
    const inbox = await listInbox(vendor.owner);
    const row = inbox.find((r) => r.threadId === first.threadId);
    expect(row).toMatchObject({ title: 'Ada', eventName: "Ada's 40th", unread: 2, asOrgId: vendor.orgId });
    const reply = await sendMessage(vendor.owner, {
      threadId: first.threadId,
      clientMessageId: cid(),
      body: 'Yes we are!',
    });
    const stored = await prisma.message.findUniqueOrThrow({ where: { id: reply.messageId } });
    expect(stored.authorOrgId).toBe(vendor.orgId);
  });

  it('a vendor cannot cold-message a client; a co-host without chat permission cannot start chats', async () => {
    const host = await makeUser('Host');
    const vendor = await makeVendor('Cold DJ');
    await expect(
      startThread(vendor.owner, {
        context: 'PROFILE',
        asOrgId: vendor.orgId,
        toUserId: host.userId,
        firstMessage: { clientMessageId: cid(), body: 'Book me!' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const eventId = await makeEvent(host, new Date('2031-02-01T12:00:00Z'));
    const viewer = await makeUser('Viewer');
    await prisma.eventParticipant.create({
      data: { eventId, userId: viewer.userId, role: 'CO_HOST', permissions: toStoredPermissions(PRESETS.view_only) },
    });
    await expect(
      startThread(viewer, {
        context: 'PROFILE',
        toOrgId: vendor.orgId,
        eventId,
        firstMessage: { clientMessageId: cid(), body: 'Hi' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('asOrgId requires membership of that business', async () => {
    const someone = await makeUser('Someone');
    const vendor = await makeVendor('Not Mine');
    const other = await makeVendor('Other');
    await expect(
      startThread(someone, {
        context: 'PLANNER_VENDOR',
        asOrgId: vendor.orgId,
        toOrgId: other.orgId,
        firstMessage: { clientMessageId: cid(), body: 'x' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('sendMessage, receipts, edit and delete', () => {
  async function thread() {
    const host = await makeUser('Kemi');
    const vendor = await makeVendor('Lens Co');
    const { threadId } = await startThread(host, {
      context: 'PROFILE',
      toOrgId: vendor.orgId,
      firstMessage: { clientMessageId: cid(), body: 'Hello' },
    });
    return { host, vendor, threadId };
  }

  it('is idempotent on clientMessageId (retries never duplicate)', async () => {
    const { host, threadId } = await thread();
    const id = cid();
    const [a, b] = await Promise.all([
      sendMessage(host, { threadId, clientMessageId: id, body: 'Once' }),
      sendMessage(host, { threadId, clientMessageId: id, body: 'Once' }),
    ]);
    expect(a.messageId).toBe(b.messageId);
    expect(await prisma.message.count({ where: { threadId, clientMessageId: id } })).toBe(1);
  });

  it('markRead clears unread for the whole business team', async () => {
    const { vendor, threadId } = await thread();
    const teammate = await makeUser('Teammate');
    await prisma.membership.create({ data: { orgId: vendor.orgId, userId: teammate.userId, role: 'STAFF' } });
    const { messages } = await listMessages(teammate, threadId);
    expect((await listInbox(vendor.owner)).find((r) => r.threadId === threadId)?.unread).toBe(1);
    expect(await unreadTotal(teammate)).toBeGreaterThanOrEqual(1);
    await markRead(teammate, { threadId, upToMessageId: messages[0]!.id });
    expect((await listInbox(vendor.owner)).find((r) => r.threadId === threadId)?.unread).toBe(0);
    expect(await unreadTotal(teammate)).toBe(0);
  });

  it('authors edit within 15 minutes; nobody can delete (D-X37); others cannot edit', async () => {
    const { host, vendor, threadId } = await thread();
    const { messageId } = await sendMessage(host, { threadId, clientMessageId: cid(), body: 'Typo' });
    await editMessage(host, { messageId, body: 'Fixed' });
    await expect(editMessage(vendor.owner, { messageId, body: 'Hacked' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      editMessage(host, { messageId, body: 'Late' }, new Date(Date.now() + 16 * 60_000)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteMessage(host, { messageId })).rejects.toBeInstanceOf(ForbiddenError);
    const view = (await listMessages(vendor.owner, threadId)).messages.find((m) => m.id === messageId);
    expect(view).toMatchObject({ deleted: false, body: 'Fixed' });
  });

  it('shows the other side as online, then last seen (D-X37)', async () => {
    const { host, vendor, threadId } = await thread();
    const now = new Date();
    expect((await threadPresence(host, threadId, now)).online).toBe(false);
    await touchPresence(vendor.owner, now);
    expect(await threadPresence(host, threadId, now)).toMatchObject({ online: true, lastSeenAt: now.toISOString() });
    const later = new Date(now.getTime() + 5 * 60_000);
    expect(await threadPresence(host, threadId, later)).toMatchObject({ online: false, lastSeenAt: now.toISOString() });
  });

  it('rings the bell for the other side once per unread conversation, masked (D-X37)', async () => {
    const { host, vendor, threadId } = await thread();
    const first = await sendMessage(host, {
      threadId,
      clientMessageId: cid(),
      body: 'Call me on 0803 123 4567',
      acknowledgeContactWarning: true,
    });
    expect((await notifyNewMessage(first.messageId)).notified).toBe(1);
    const second = await sendMessage(host, { threadId, clientMessageId: cid(), body: 'Are you free on 2026-11-03?' });
    expect((await notifyNewMessage(second.messageId)).notified).toBe(0);
    const rows = await prisma.notification.findMany({ where: { userId: vendor.owner.userId, type: 'chat.message' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).not.toContain('0803');
    expect(rows[0]?.url).toBe(`/inbox/${threadId}`);
  });

  it('replies quote the original message (WhatsApp-style)', async () => {
    const { host, vendor, threadId } = await thread();
    const { messageId } = await sendMessage(host, { threadId, clientMessageId: cid(), body: 'Can you do 70 guests?' });
    const reply = await sendMessage(vendor.owner, {
      threadId,
      clientMessageId: cid(),
      body: 'Yes we can',
      replyToId: messageId,
    });
    const view = (await listMessages(host, threadId)).messages.find((m) => m.id === reply.messageId);
    expect(view?.replyTo).toMatchObject({ mine: true, body: 'Can you do 70 guests?', attachment: false });
  });

  it('strangers get NOT_FOUND; a block stops further messages both ways', async () => {
    const { host, vendor, threadId } = await thread();
    const stranger = await makeUser('Stranger');
    await expect(sendMessage(stranger, { threadId, clientMessageId: cid(), body: 'hi' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await prisma.userBlock.create({ data: { blockerOrgId: vendor.orgId, blockedUserId: host.userId } });
    await expect(sendMessage(host, { threadId, clientMessageId: cid(), body: 'hello?' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(sendMessage(vendor.owner, { threadId, clientMessageId: cid(), body: 'bye' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('archived threads leave the inbox and come back on a new message; pages are newest first', async () => {
    const { host, vendor, threadId } = await thread();
    await archiveThread(host, { threadId, archived: true });
    expect((await listInbox(host)).some((r) => r.threadId === threadId)).toBe(false);
    for (let i = 0; i < 55; i += 1) {
      await sendMessage(vendor.owner, { threadId, clientMessageId: cid(), body: `m${i}` });
    }
    expect((await listInbox(host)).some((r) => r.threadId === threadId)).toBe(true);
    const page1 = await listMessages(host, threadId);
    expect(page1.messages).toHaveLength(50);
    expect(page1.hasMore).toBe(true);
    expect(page1.messages[0]?.body).toBe('m54');
    const page2 = await listMessages(host, threadId, page1.messages.at(-1)!.id);
    expect(page2.messages.at(-1)?.body).toBe('Hello');
    expect(page2.hasMore).toBe(false);
  });
});

describe('event-team threads', () => {
  it('sync adds the team, removes people who leave, supports mentions and decisions', async () => {
    const host = await makeUser('Host');
    const eventId = await makeEvent(host, new Date('2031-03-01T10:00:00Z'));
    const cohost = await makeUser('Tolu');
    const member = await prisma.eventParticipant.create({
      data: { eventId, userId: cohost.userId, role: 'CO_HOST', permissions: toStoredPermissions(PRESETS.contributor) },
    });
    const { threadId, members } = await syncEventTeamThread(eventId);
    expect(members).toBe(2);
    expect((await syncEventTeamThread(eventId)).threadId).toBe(threadId); // idempotent

    const { messageId } = await sendMessage(host, {
      threadId,
      clientMessageId: cid(),
      body: '@Tolu can you confirm the cake?',
      mentions: [cohost.userId, users[0]!], // a non-member mention is dropped
    });
    expect((await prisma.message.findUniqueOrThrow({ where: { id: messageId } })).mentions).toEqual([cohost.userId]);
    await markDecision(cohost, { messageId });
    expect((await prisma.message.findUniqueOrThrow({ where: { id: messageId } })).isDecision).toBe(true);

    await prisma.eventParticipant.update({ where: { id: member.id }, data: { removedAt: new Date() } });
    await syncEventTeamThread(eventId);
    await expect(sendMessage(cohost, { threadId, clientMessageId: cid(), body: 'still here?' })).rejects.toBeInstanceOf(
      NotFoundError,
    );

    // A returning member rejoins on the next sync (P13-T02).
    await prisma.eventParticipant.create({
      data: { eventId, userId: cohost.userId, role: 'CO_HOST', permissions: toStoredPermissions(PRESETS.contributor) },
    });
    const resynced = await syncEventTeamThread(eventId);
    expect(resynced.threadId).toBe(threadId);
    const { messageId: backId } = await sendMessage(cohost, {
      threadId,
      clientMessageId: cid(),
      body: 'back again',
    });
    expect(backId).toBeTruthy();
  });
});

describe('guest enquiries (UF-31)', () => {
  it('only after the event, for a business that worked on it, attended, verified phone', async () => {
    const host = await makeUser('Host');
    const vendor = await makeVendor('Party DJ');
    const phone = `+234803${RUN}`.slice(0, 14);
    const guest = await makeUser('Guest', { phone, phoneVerified: true });
    const pastEvent = await makeEvent(host, new Date('2020-05-01T10:00:00Z'));
    await prisma.eventParticipant.create({ data: { eventId: pastEvent, orgId: vendor.orgId, role: 'VENDOR' } });
    const enquiry = () =>
      startThread(guest, {
        context: 'GUEST_ENQUIRY',
        toOrgId: vendor.orgId,
        eventId: pastEvent,
        firstMessage: { clientMessageId: cid(), body: 'Loved your set! Are you free in June?' },
      });

    await expect(enquiry()).rejects.toBeInstanceOf(ForbiddenError); // not on the guest list yet
    await prisma.guest.create({ data: { eventId: pastEvent, name: 'Guest', phone, rsvp: 'YES' } });
    const { threadId } = await enquiry();

    // The vendor replies, but can never message a guest first elsewhere.
    await sendMessage(vendor.owner, { threadId, clientMessageId: cid(), body: 'Thank you! Yes.' });
    const futureEvent = await makeEvent(host, new Date('2031-05-01T10:00:00Z'));
    await prisma.eventParticipant.create({ data: { eventId: futureEvent, orgId: vendor.orgId, role: 'VENDOR' } });
    await expect(
      startThread(guest, {
        context: 'GUEST_ENQUIRY',
        toOrgId: vendor.orgId,
        eventId: futureEvent,
        firstMessage: { clientMessageId: cid(), body: 'Hi' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError); // event hasn't ended
  });
});
