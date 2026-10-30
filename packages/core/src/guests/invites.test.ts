import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { enableInvites, sharedLinkRsvp, toggleSharedLink } from './invites.js';

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
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('invites switches', () => {
  it('toggles invitations and the shared link (both off by default)', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    // Schema default is off (GST-04); templates may enable invites at creation.
    const raw = await prisma.event.create({
      data: {
        slug: `t05-${Date.now()}`,
        type: 'custom',
        format: 'PRIVATE_CELEBRATION',
        name: 'x',
        countryCode: 'NG',
        currency: 'NGN',
        timezone: 'UTC',
        createdById: host.userId,
      },
      select: { id: true, invitesEnabled: true, sharedLinkEnabled: true },
    });
    events.push(raw.id);
    expect(raw.invitesEnabled).toBe(false);
    expect(raw.sharedLinkEnabled).toBe(false);

    expect(await enableInvites(host, { eventId, enabled: true })).toEqual({ enabled: true });
    expect(await toggleSharedLink(host, { eventId, enabled: true })).toEqual({ enabled: true });
    const after = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(after.invitesEnabled).toBe(true);
    expect(after.sharedLinkEnabled).toBe(true);
    expect(await enableInvites(host, { eventId, enabled: false })).toEqual({ enabled: false });
  });
});

describe('sharedLinkRsvp', () => {
  it('creates a SHARED_LINK guest with an immediate YES (UF-09-1)', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    await toggleSharedLink(host, { eventId, enabled: true });
    const { slug } = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });

    const { guestId } = await sharedLinkRsvp({ eventSlug: slug, name: 'Walk-in Wale', phone: '08031234567' });
    const guest = await prisma.guest.findUniqueOrThrow({ where: { id: guestId } });
    expect(guest).toMatchObject({ source: 'SHARED_LINK', rsvp: 'YES', phone: '+2348031234567' });
    expect(guest.inviteToken).toBeTruthy();
  });

  it('rejects when the link is off, the event is gone, or the phone is bad (UF-09-2)', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const { slug } = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });

    await expect(sharedLinkRsvp({ eventSlug: slug, name: 'x' })).rejects.toThrow(/closed/);
    await expect(sharedLinkRsvp({ eventSlug: 'no-such-slug', name: 'x' })).rejects.toThrow(/not found/i);
    await toggleSharedLink(host, { eventId, enabled: true });
    await expect(sharedLinkRsvp({ eventSlug: slug, name: 'x', phone: '123' })).rejects.toThrow();
    // …and turning it back off closes RSVP again.
    await toggleSharedLink(host, { eventId, enabled: false });
    await expect(sharedLinkRsvp({ eventSlug: slug, name: 'x' })).rejects.toThrow(/closed/);
  });
});

describe('rsvp link signing', () => {
  const secret = 'test-secret-0123456789abcdef';

  it('signs and verifies yes/no links; rejects tampering', async () => {
    const { rsvpLink, signRsvp, verifyRsvp } = await import('./invites.js');
    const token = 'guest-token-abc';
    const yes = signRsvp(token, 'yes', secret);
    expect(verifyRsvp(token, 'yes', yes, secret)).toBe(true);
    expect(verifyRsvp(token, 'no', yes, secret)).toBe(false);
    expect(verifyRsvp(token, 'yes', `${yes.slice(0, -2)}xx`, secret)).toBe(false);
    expect(verifyRsvp(token, 'maybe', yes, secret)).toBe(false);
    expect(rsvpLink('https://tiwa.app/', token, 'no', secret)).toBe(
      `https://tiwa.app/i/${token}?r=no&sig=${signRsvp(token, 'no', secret)}`,
    );
  });
});

describe('batch lists', () => {
  it('lists batches with counts and deliveries with redaction', async () => {
    const { batchDeliveries, listBatches } = await import('./invites.js');
    const { createInviteBatch } = await import('./batches.js');
    const { addGuests } = await import('./guests.js');
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const { enableInvites } = await import('./invites.js');
    await enableInvites(host, { eventId, enabled: true });
    await addGuests(host, { eventId, guests: [{ name: 'Ada', phone: '08031234567', groupIds: [] }] });
    const preview = await createInviteBatch(host, {
      eventId,
      audience: { type: 'all' },
      channels: ['SMS'],
      smart: true,
      message: 'hi',
      kind: 'INVITE',
    });
    const batches = await listBatches(host, { eventId });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      id: preview.batchId,
      kind: 'INVITE',
      status: 'DRAFT',
      total: 1,
      sent: 0,
      failed: 0,
    });
    const detail = await batchDeliveries(host, { batchId: preview.batchId });
    expect(detail.deliveries).toHaveLength(1);
    expect(detail.deliveries[0]).toMatchObject({ guestName: 'Ada', channel: 'SMS', status: 'QUEUED' });
    expect(detail.deliveries[0]?.contact).toBe('+2348031234567');
  });
});

describe('free-mode queue', () => {
  it('lists queued free-mode messages with rendered text and marks them sent', async () => {
    const { freeModeQueue, markSentManually } = await import('./invites.js');
    const { createInviteBatch } = await import('./batches.js');
    const { addGuests } = await import('./guests.js');
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const { enableInvites } = await import('./invites.js');
    await enableInvites(host, { eventId, enabled: true });
    await addGuests(host, { eventId, guests: [{ name: 'Ada', phone: '08031234567', groupIds: [] }] });
    const preview = await createInviteBatch(host, {
      eventId,
      audience: { type: 'all' },
      channels: ['WHATSAPP'],
      smart: true,
      message: 'Hi {name}! {link}',
      kind: 'INVITE',
    });
    // Fan-out routing (normally the worker's job): WHATSAPP → WHATSAPP_FREE.
    await prisma.inviteDelivery.updateMany({ where: { batchId: preview.batchId }, data: { channel: 'WHATSAPP_FREE' } });

    const queue = await freeModeQueue(host, { eventId, appUrl: 'https://tiwa.app' });
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.guestName).toBe('Ada');
    expect(queue.items[0]?.phone).toBe('+2348031234567');
    expect(queue.items[0]?.text).toContain('Hi Ada!');
    expect(queue.items[0]?.text).toContain('https://tiwa.app/i/');

    const marked = await markSentManually(host, { deliveryId: queue.items[0]?.deliveryId as string });
    expect(marked.batchDone).toBe(true);
    const batch = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: preview.batchId } });
    expect(batch.status).toBe('DONE');
    expect((await freeModeQueue(host, { eventId, appUrl: 'https://tiwa.app' })).items).toEqual([]);
    await expect(markSentManually(host, { deliveryId: queue.items[0]?.deliveryId as string })).rejects.toThrow();
  });
});
