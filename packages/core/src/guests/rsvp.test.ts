import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { enableInvites } from './invites.js';
import { answerRsvp, checkinQrValue, invitePage, revokeInvite, undoRsvp, verifyCheckinQr } from './rsvp.js';

const users: string[] = [];
const events: string[] = [];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function tokenFixture() {
  // Personal tokens are born in the invite batch (createInviteBatch), not at
  // guest add — the fixture mirrors the real invite flow.
  const host = await makeHost();
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  events.push(eventId);
  await enableInvites(host, { eventId, enabled: true });
  const { addGuests } = await import('./guests.js');
  const { createInviteBatch } = await import('./batches.js');
  await addGuests(host, { eventId, guests: [{ name: 'Ada', phone: '08031234567', groupIds: [] }] });
  const preview = await createInviteBatch(host, {
    eventId,
    audience: { type: 'all' },
    channels: ['LINK'],
    smart: true,
    message: 'hi',
    kind: 'INVITE',
  });
  expect(preview.total).toBe(1);
  const guest = await prisma.guest.findFirstOrThrow({ where: { eventId } });
  return { host, eventId, token: guest.inviteToken as string };
}

afterAll(async () => {
  await prisma.inviteDelivery.deleteMany({ where: { guest: { eventId: { in: events } } } });
  await prisma.inviteBatch.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guestGroup.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('invitePage', () => {
  it('reads the guest + public event info for a valid token', async () => {
    const { token } = await tokenFixture();
    const page = await invitePage(token);
    expect(page.guest.name).toBe('Ada');
    expect(page.event.hostName).toBeTruthy();
    expect(page.event.venueName ?? 'Venue not decided yet').toContain('not decided');
  });

  it('404s on garbage, revoked and deleted links', async () => {
    const { host, eventId, token } = await tokenFixture();
    await expect(invitePage('not-a-token')).rejects.toThrow(/not found/i);
    await prisma.guest.updateMany({ where: { eventId }, data: { inviteRevokedAt: new Date() } });
    await expect(invitePage(token)).rejects.toThrow(/not found/i);
    await prisma.guest.updateMany({ where: { eventId }, data: { inviteRevokedAt: null } });
    await revokeInvite(host, {
      eventId,
      guestId: (await prisma.guest.findFirstOrThrow({ where: { inviteToken: token } })).id,
    });
    await expect(invitePage(token)).rejects.toThrow(/not found/i);
  });
});

describe('answerRsvp + undo', () => {
  it('records yes/no with extras idempotently; undo flips', async () => {
    const { token } = await tokenFixture();
    const yes = await answerRsvp({ token, response: 'YES', plusOnes: 3, meal: 'Jollof' });
    expect(yes.rsvp).toBe('YES');
    expect(yes.undoUntil.getTime()).toBeGreaterThan(yes.respondedAt.getTime());
    const guest = await prisma.guest.findUniqueOrThrow({ where: { inviteToken: token } });
    expect(guest).toMatchObject({ rsvp: 'YES', plusOnes: 3, meal: 'Jollof' });

    // Re-answering the same value is a no-op (still recorded, no error).
    const again = await answerRsvp({ token, response: 'YES' });
    expect(again.rsvp).toBe('YES');

    const undone = await undoRsvp(token);
    expect(undone.rsvp).toBe('NO');
    // Fields survive the flip.
    const after = await prisma.guest.findUniqueOrThrow({ where: { inviteToken: token } });
    expect(after).toMatchObject({ rsvp: 'NO', plusOnes: 3, meal: 'Jollof' });
  });

  it('rejects bad tokens and closed events', async () => {
    await expect(answerRsvp({ token: 'x'.repeat(43), response: 'YES' })).rejects.toThrow(/not found/i);
    const { host, eventId, token } = await tokenFixture();
    await prisma.event.update({ where: { id: eventId }, data: { status: 'CANCELLED' } });
    await expect(answerRsvp({ token, response: 'YES' })).rejects.toThrow(/closed/i);
    expect(host).toBeTruthy();
  });
});

describe('revokeInvite', () => {
  it('issues a fresh token; old links die', async () => {
    const { host, eventId, token } = await tokenFixture();
    const guestId = (await prisma.guest.findUniqueOrThrow({ where: { inviteToken: token } })).id;
    const { token: fresh } = await revokeInvite(host, { eventId, guestId });
    expect(fresh).not.toBe(token);
    expect(fresh).toHaveLength(43);
    const page = await invitePage(fresh);
    expect(page.guest.id).toBe(guestId);
    await expect(invitePage(token)).rejects.toThrow(/not found/i);
  });
});

describe('check-in QR', () => {
  it('signs and verifies; rejects tampering and expiry', () => {
    const secret = 'test-secret';
    const value = checkinQrValue('guest-1', 'event-1', secret);
    expect(verifyCheckinQr(value, secret)).toEqual({ guestId: 'guest-1', eventId: 'event-1' });
    expect(verifyCheckinQr(`${value.slice(0, -3)}xxx`, secret)).toBeNull();
    expect(verifyCheckinQr(value, 'other-secret')).toBeNull();
    expect(verifyCheckinQr('checkin:g:e:1:sig', secret)).toBeNull();
    expect(verifyCheckinQr('nonsense', secret)).toBeNull();
    expect(verifyCheckinQr(checkinQrValue('g', 'e', secret, -1), secret)).toBeNull();
  });
});
