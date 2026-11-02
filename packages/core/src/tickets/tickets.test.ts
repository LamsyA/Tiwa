// P11 tickets: catalogue, reservations (capacity lock), promos, free
// issue, expiry, waitlist (TKT-01–TKT-08, UF-22). Follows the repo's
// integration-test pattern (real Postgres, per-file cleanup).
import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { confirmFreeOrder, expireReservations, joinWaitlist, reserveTickets } from './orders.js';
import { createPromo, createTicketType } from './manage.js';
import { ticketIncome } from './queries.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const SECRET = 'test-secret-p11';
const users: string[] = [];
const events: string[] = [];

async function makeHost(): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name: 'P11 Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeEvent(host: UserActor, slug: string) {
  const event = await prisma.event.create({
    data: {
      id: (await import('../shared/ids.js')).uuidv7(),
      slug,
      type: 'conference',
      format: 'PUBLIC_TICKETED',
      status: 'ACTIVE',
      name: 'P11 Test Conference',
      visibility: 'PUBLIC',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      ticketsEnabled: true,
      ticketsPublished: true,
      createdById: host.userId,
      participants: {
        create: {
          id: (await import('../shared/ids.js')).uuidv7(),
          userId: host.userId,
          role: 'HOST',
          permissions: toStoredPermissions(permissionsFor('HOST', 'full')),
          acceptedAt: new Date(),
        },
      },
    },
  });
  events.push(event.id);
  return event;
}

let host: UserActor;
let slug = '';
let typeId = '';

beforeAll(async () => {
  host = await makeHost();
  slug = `p11-conf-${Date.now().toString(36)}`;
  await makeEvent(host, slug);
  const created = await createTicketType(host, {
    eventId: (await prisma.event.findUniqueOrThrow({ where: { slug } })).id,
    name: 'General',
    priceMinor: '0',
    quantity: 100,
    maxPerOrder: 10,
  });
  typeId = created.ticketTypeId;
});

afterAll(async () => {
  const eventIds = events;
  await prisma.checkIn.deleteMany({ where: { eventId: { in: eventIds } } }).catch(() => undefined);
  await prisma.ticket.deleteMany({ where: { eventId: { in: eventIds } } }).catch(() => undefined);
  await prisma.ticketOrder.deleteMany({ where: { eventId: { in: eventIds } } }).catch(() => undefined);
  await prisma.promoCode.deleteMany({ where: { eventId: { in: eventIds } } }).catch(() => undefined);
  await prisma.waitlistEntry.deleteMany({ where: { eventId: { in: eventIds } } }).catch(() => undefined);
  await prisma.ticketType.deleteMany({ where: { eventId: { in: eventIds } } }).catch(() => undefined);
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: eventIds } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
});

describe('ticket catalogue (P11-T02)', () => {
  it('creates a promo and rejects duplicates', async () => {
    const event = await prisma.event.findUniqueOrThrow({ where: { slug } });
    const promo = await createPromo(host, { eventId: event.id, code: 'EARLY10', percentOff: 10 });
    expect(promo.promoId).toBeTruthy();
    await expect(createPromo(host, { eventId: event.id, code: 'early10', percentOff: 10 })).rejects.toThrow();
  });
});

describe('reservations (P11-T04, UF-22-1/22-3)', () => {
  it('reserves free tickets and issues them instantly', async () => {
    const reserved = await reserveTickets({
      eventSlug: slug,
      items: [{ ticketTypeId: typeId, qty: 2 }],
      buyerName: 'Ada Buyer',
      buyerEmail: `ada-${Date.now()}@example.com`,
      answers: {},
    });
    expect(reserved.free).toBe(true);
    const confirmed = await confirmFreeOrder(reserved.orderId, SECRET);
    expect(confirmed.tickets).toHaveLength(2);
    const event = await prisma.event.findUniqueOrThrow({ where: { slug } });
    expect(await ticketIncome(event.id)).toBe(0n);
  });

  it('never oversells under concurrency (UF-22-1)', async () => {
    const event = await prisma.event.findUniqueOrThrow({ where: { slug } });
    const small = await createTicketType(host, {
      eventId: event.id,
      name: `Small-${Date.now().toString(36)}`,
      priceMinor: '0',
      quantity: 100,
      maxPerOrder: 5,
    });
    // UF-22-1: 200 parallel checkout attempts for 100 seats → exactly 100 tickets.
    const attempts = await Promise.allSettled(
      Array.from({ length: 200 }, (_, index) =>
        reserveTickets({
          eventSlug: slug,
          items: [{ ticketTypeId: small.ticketTypeId, qty: 1 }],
          buyerName: `Buyer ${index}`,
          buyerEmail: `buyer-${Date.now()}-${index}@example.com`,
          answers: {},
        }),
      ),
    );
    const ok = attempts.filter((result) => result.status === 'fulfilled').length;
    expect(ok).toBe(100);
    const type = await prisma.ticketType.findUniqueOrThrow({ where: { id: small.ticketTypeId } });
    expect(type.reserved).toBe(100);
  }, 30_000);

  it('releases seats when the reservation expires (UF-22-2)', async () => {
    const event = await prisma.event.findUniqueOrThrow({ where: { slug } });
    const before = await prisma.ticketType.findUniqueOrThrow({ where: { id: typeId } });
    const reserved = await reserveTickets({
      eventSlug: slug,
      items: [{ ticketTypeId: typeId, qty: 3 }],
      buyerName: 'Slow Buyer',
      buyerEmail: `slow-${Date.now()}@example.com`,
      answers: {},
    });
    await prisma.ticketOrder.update({
      where: { id: reserved.orderId },
      data: { reservedUntil: new Date(Date.now() - 1000) },
    });
    const { expired } = await expireReservations(new Date());
    expect(expired).toBeGreaterThanOrEqual(1);
    const after = await prisma.ticketType.findUniqueOrThrow({ where: { id: typeId } });
    expect(after.reserved).toBe(before.reserved);
    void event;
  });
});

describe('waitlist (TKT-08)', () => {
  it('joins the waitlist', async () => {
    const entry = await joinWaitlist({ eventSlug: slug, email: `wait-${Date.now()}@example.com`, qty: 2 });
    expect(entry.waitlistId).toBeTruthy();
  });
});
