// P14-T02: deliveries confirm in machine order; closing needs everything
// delivered; the close pack joins bookings, vendors and reviews.
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { closeEvent, closePack, confirmDelivery } from './close.js';
import { createReview } from './reviews.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeEvent(host: UserActor): Promise<string> {
  const event = await prisma.event.create({
    data: {
      slug: `close-${Date.now().toString(36)}-${events.length}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'ACTIVE',
      name: 'Close Event',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      createdById: host.userId,
    },
  });
  events.push(event.id);
  await prisma.eventParticipant.create({
    data: { eventId: event.id, userId: host.userId, role: 'HOST', permissions: '{}' },
  });
  return event.id;
}

afterAll(async () => {
  await prisma.review.deleteMany({ where: { authorId: { in: users } } }).catch(() => undefined);
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: events } } }).catch(() => undefined);
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
});

describe('close flow (P14-T02)', () => {
  it('confirms deliveries, blocks early close, then closes and packs reviews', async () => {
    const host = await makeUser('Close Host');
    const eventId = await makeEvent(host);
    const org = await prisma.organization.create({
      data: { kind: 'VENDOR', name: 'Close Catering', slug: `close-cat-${Date.now().toString(36)}`, countryCode: 'NG' },
    });
    orgs.push(org.id);
    const booking = await prisma.booking.create({
      data: {
        eventId,
        vendorOrgId: org.id,
        category: 'catering',
        status: 'IN_PROGRESS',
        paymentMode: 'OFFLINE',
        totalMinor: 100_000n,
        currency: 'NGN',
      },
    });

    // Undelivered: closing is blocked.
    await expect(closeEvent(host, { eventId })).rejects.toThrow(/delivered/i);
    const moved = await confirmDelivery(host, { bookingId: booking.id });
    expect(moved.status).toBe('DELIVERED');

    // Review while delivered? No — COMPLETED only (machine: DELIVERED → COMPLETED).
    await expect(
      createReview(host, { bookingId: booking.id, quality: 5, communication: 5, punctuality: 5, value: 5, scope: 5 }),
    ).rejects.toThrow(/completed/i);
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });
    await createReview(host, {
      bookingId: booking.id,
      quality: 5,
      communication: 5,
      punctuality: 5,
      value: 5,
      scope: 5,
    });

    const pack = await closePack(host, eventId);
    expect(pack.bookings).toHaveLength(1);
    expect(pack.bookings[0]!.review?.overall).toBe(5);
    expect(pack.bookings[0]!.vendorName).toBe('Close Catering');

    const closed = await closeEvent(host, { eventId });
    expect(closed.status).toBe('COMPLETED');
    await expect(closeEvent(host, { eventId })).rejects.toThrow();
  });
});
