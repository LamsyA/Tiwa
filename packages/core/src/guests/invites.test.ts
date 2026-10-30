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
