// P14-T01: one review per COMPLETED booking, vendor reply once,
// report flow, score hidden until 5 reviews (REV-01–REV-06, UF-25-1).
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { createReview, listVendorReviews, replyToReview, reportReview, vendorRating } from './reviews.js';

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
      slug: `review-${Date.now().toString(36)}-${events.length}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'ACTIVE',
      name: 'Review Event',
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

async function makeBooking(eventId: string, vendorOrgId: string, status: 'CONFIRMED' | 'COMPLETED' = 'COMPLETED') {
  return prisma.booking.create({
    data: {
      eventId,
      vendorOrgId,
      category: 'catering',
      status,
      paymentMode: 'OFFLINE',
      totalMinor: 100_000n,
      currency: 'NGN',
    },
  });
}

const SCORES = { quality: 5, communication: 4, punctuality: 5, value: 4, scope: 5 } as const;

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: users } } }).catch(() => undefined);
  await prisma.outboxEvent
    .deleteMany({ where: { topic: { in: ['review.received', 'review.replied'] } } })
    .catch(() => undefined);
  await prisma.report.deleteMany({ where: { reporterUserId: { in: users } } }).catch(() => undefined);
  await prisma.review.deleteMany({ where: { authorId: { in: users } } }).catch(() => undefined);
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: events } } }).catch(() => undefined);
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
});

describe('reviews (P14-T01)', () => {
  it('rejects reviews before the booking is COMPLETED (UF-25-1) and allows one after', async () => {
    const host = await makeUser('Review Host');
    const eventId = await makeEvent(host);
    const org = await prisma.organization.create({
      data: { kind: 'VENDOR', name: 'Review Catering', slug: `rev-cat-${Date.now().toString(36)}`, countryCode: 'NG' },
    });
    orgs.push(org.id);
    const open = await makeBooking(eventId, org.id, 'CONFIRMED');
    await expect(createReview(host, { bookingId: open.id, ...SCORES })).rejects.toThrow(/completed/i);
    await prisma.booking.update({ where: { id: open.id }, data: { status: 'COMPLETED' } });

    const first = await createReview(host, { bookingId: open.id, ...SCORES, body: 'Superb jollof' });
    expect(first.overall).toBeCloseTo(4.6);
    await expect(createReview(host, { bookingId: open.id, ...SCORES })).rejects.toThrow();
    const photos = await makeBooking(eventId, org.id);
    await expect(
      createReview(host, { bookingId: photos.id, ...SCORES, photoIds: ['00000000-0000-0000-0000-000000000000'] }),
    ).rejects.toThrow(/event/i);

    // Vendor replies once, on their own review.
    const vendor = await makeUser('Review Vendor');
    await expect(replyToReview(vendor, { reviewId: first.reviewId, body: 'Thanks!' })).rejects.toThrow();
    await prisma.membership.create({ data: { orgId: org.id, userId: vendor.userId, role: 'OWNER' } });
    await replyToReview(vendor, { reviewId: first.reviewId, body: 'Thanks, see you next time!' });
    await expect(replyToReview(vendor, { reviewId: first.reviewId, body: 'Again' })).rejects.toThrow();

    // Anyone may report; the row lands in the admin queue.
    const { reportId } = await reportReview(host, { reviewId: first.reviewId, reason: 'test report' });
    expect(reportId).toBeTruthy();
  });

  it('hides the score until 5 reviews (REV-05)', async () => {
    const host = await makeUser('Rating Host');
    const eventId = await makeEvent(host);
    const org = await prisma.organization.create({
      data: { kind: 'VENDOR', name: 'Rating Catering', slug: `rat-cat-${Date.now().toString(36)}`, countryCode: 'NG' },
    });
    orgs.push(org.id);
    for (let index = 0; index < 4; index++) {
      const booking = await makeBooking(eventId, org.id);
      await createReview(host, { bookingId: booking.id, ...SCORES });
    }
    expect(await vendorRating(org.id)).toEqual({ count: 4, average: null });
    const fifth = await makeBooking(eventId, org.id);
    await createReview(host, { bookingId: fifth.id, quality: 3, communication: 3, punctuality: 3, value: 3, scope: 3 });
    const rating = await vendorRating(org.id);
    expect(rating.count).toBe(5);
    expect(rating.average).toBeCloseTo(4.28, 1);
    expect(await listVendorReviews(org.id)).toHaveLength(5);
  });
});
