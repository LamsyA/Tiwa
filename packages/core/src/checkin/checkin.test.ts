// P11 check-in: ticket + invitation passes, duplicates, offline list/sync
// (DAY-07, UF-23-1/23-2).
import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { checkinQrValue } from '../guests/rsvp.js';
import { confirmFreeOrder, reserveTickets } from '../tickets/orders.js';
import { createTicketType } from '../tickets/manage.js';
import { checkIn, offlineList, syncOfflineCheckins, verifyOfflineList } from './checkin.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const SECRET = 'test-secret-p11-checkin';
const users: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

let host: UserActor;
let staff: UserActor;
let slug = '';
let eventId = '';
let ticketQr = '';

beforeAll(async () => {
  host = await makeUser('P11 Checkin Host');
  staff = await makeUser('P11 Door Staff');
  slug = `p11-checkin-${Date.now().toString(36)}`;
  const event = await prisma.event.create({
    data: {
      id: (await import('../shared/ids.js')).uuidv7(),
      slug,
      type: 'conference',
      format: 'PUBLIC_TICKETED',
      status: 'ACTIVE',
      name: 'P11 Checkin Event',
      visibility: 'PUBLIC',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      ticketsEnabled: true,
      ticketsPublished: true,
      createdById: host.userId,
      participants: {
        create: [
          {
            id: (await import('../shared/ids.js')).uuidv7(),
            userId: host.userId,
            role: 'HOST',
            permissions: toStoredPermissions(permissionsFor('HOST', 'full')),
            acceptedAt: new Date(),
          },
          {
            id: (await import('../shared/ids.js')).uuidv7(),
            userId: staff.userId,
            role: 'PLANNER_STAFF',
            permissions: toStoredPermissions(permissionsFor('PLANNER_STAFF', 'contributor')),
            acceptedAt: new Date(),
          },
        ],
      },
    },
  });
  eventId = event.id;
  events.push(eventId);
  const type = await createTicketType(host, {
    eventId,
    name: 'General',
    priceMinor: '0',
    quantity: 50,
    maxPerOrder: 10,
  });
  const reserved = await reserveTickets({
    eventSlug: slug,
    items: [{ ticketTypeId: type.ticketTypeId, qty: 1 }],
    buyerName: 'Checked In Ada',
    buyerEmail: `checkin-${Date.now()}@example.com`,
    answers: {},
  });
  const confirmed = await confirmFreeOrder(reserved.orderId, SECRET);
  const firstTicketId = confirmed.tickets[0] as string;
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: firstTicketId } });
  ticketQr = ticket.qrToken;
});

afterAll(async () => {
  await prisma.checkIn.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.ticket.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.ticketOrder.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.ticketType.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: events } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
});

describe('door check-in (UF-23-1)', () => {
  it('checks a ticket in once, then reports the duplicate with the first scan', async () => {
    const first = await checkIn(host, { eventId, qrValue: ticketQr, deviceId: 'door-1' }, SECRET);
    expect(first.result).toBe('OK');
    expect(first.holderName).toBe('Checked In Ada');
    const second = await checkIn(staff, { eventId, qrValue: ticketQr, deviceId: 'door-2' }, SECRET);
    expect(second.result).toBe('DUPLICATE');
    expect(second.checkedInAt).toBeTruthy();
  });

  it('rejects forged QRs', async () => {
    const bad = await checkIn(host, { eventId, qrValue: 'ticket:fake:event:1:sig', deviceId: 'door-1' }, SECRET);
    expect(bad.result).toBe('INVALID');
  });

  it('scans invitation passes too (P11-T08)', async () => {
    const guest = await prisma.guest.create({
      data: { id: (await import('../shared/ids.js')).uuidv7(), eventId, name: 'Invited Tunde', rsvp: 'YES' },
    });
    const qr = checkinQrValue(guest.id, eventId, SECRET);
    const first = await checkIn(host, { eventId, qrValue: qr, deviceId: 'door-1' }, SECRET);
    expect(first.result).toBe('OK');
    expect(first.kind).toBe('guest');
    const second = await checkIn(host, { eventId, qrValue: qr, deviceId: 'door-1' }, SECRET);
    expect(second.result).toBe('DUPLICATE');
  });
});

describe('offline check-in (UF-23-2)', () => {
  it('signs the list and syncs queued scans with cross-device duplicates', async () => {
    const list = await offlineList(host, eventId, SECRET);
    expect(list.entries.length).toBeGreaterThan(0);
    expect(verifyOfflineList(list.eventId, list.issuedAt, list.signature, SECRET)).toBe(true);
    expect(verifyOfflineList(list.eventId, list.issuedAt, `${list.signature}x`, SECRET)).toBe(false);
    const fresh = list.entries.find((entry) => !entry.checkedIn);
    if (!fresh) return;
    const synced = await syncOfflineCheckins(
      staff,
      { eventId, deviceId: 'offline-door', scans: [{ qrValue: fresh.qr, scannedAt: new Date().toISOString() }] },
      SECRET,
    );
    expect(synced.synced).toBe(1);
    const again = await syncOfflineCheckins(
      host,
      { eventId, deviceId: 'second-door', scans: [{ qrValue: fresh.qr, scannedAt: new Date().toISOString() }] },
      SECRET,
    );
    expect(again.duplicates).toBe(1);
  });
});
