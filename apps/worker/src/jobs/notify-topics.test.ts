import { prisma } from '@tiwa/db';
import { createLogger } from '@tiwa/core';
import { afterAll, describe, expect, it } from 'vitest';
import {
  handleBookingChanged,
  handleChangeDeclined,
  handleChangeRequested,
  handleDayIncidentRaised,
  handleDayItemLate,
  handleDaySignoffDue,
  handlePaymentConfirmed,
  handlePaymentDeclined,
  handlePaymentRecorded,
  handleQuoteRequested,
  handleQuoteSent,
  handleReviewReceived,
  handleReviewReplied,
} from './notify-topics.js';

// P13-T04: earlier stubs fan out through notify() — rows land, keys dedupe.
const log = createLogger('test');
const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];
const payments: string[] = [];

async function makeUser(name: string) {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return user.id;
}

async function makeEvent(hostId: string, name: string) {
  const event = await prisma.event.create({
    data: {
      slug: `notify-topics-${Date.now().toString(36)}-${events.length}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'ACTIVE',
      name,
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      createdById: hostId,
    },
  });
  events.push(event.id);
  return event.id;
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: users } } }).catch(() => undefined);
  await prisma.outboxEvent.deleteMany({ where: { topic: 'messaging/notify' } }).catch(() => undefined);
  await prisma.bookingVersion.deleteMany({ where: { booking: { eventId: { in: events } } } }).catch(() => undefined);
  await prisma.vendorCheckIn.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.payment.deleteMany({ where: { id: { in: payments } } }).catch(() => undefined);
  await prisma.paymentMilestone
    .deleteMany({
      where: {
        bookingId: {
          in: (await prisma.booking.findMany({ where: { eventId: { in: events } }, select: { id: true } })).map(
            (row) => row.id,
          ),
        },
      },
    })
    .catch(() => undefined);
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.runDependency.deleteMany({ where: { item: { eventId: { in: events } } } }).catch(() => undefined);
  await prisma.runItem.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.incident.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: events } } }).catch(() => undefined);
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
});

async function rowsFor(userId: string, type: string) {
  return prisma.notification.findMany({ where: { userId, type }, orderBy: { createdAt: 'desc' } });
}

describe('P13-T04 topic fan-out', () => {
  it('day.item_late notifies dependant owners + team, once per delay', async () => {
    const hostId = await makeUser('Late Host');
    const ownerId = await makeUser('Late Owner');
    const eventId = await makeEvent(hostId, 'Late Event');
    const item = await prisma.runItem.create({
      data: { eventId, title: 'Cake', startsAt: new Date('2031-06-01T10:00:00Z'), ownerUserId: ownerId },
    });
    const payload = {
      eventId,
      itemId: item.id,
      lateByMin: 20,
      dependantIds: [],
      ownerUserIds: [ownerId],
      ownerOrgIds: [],
    };
    const first = await handleDayItemLate(payload, log);
    expect(first).toMatchObject({ notified: 2, skipped: 0 }); // owner + host
    expect(await rowsFor(ownerId, 'day.item_late')).toHaveLength(1);
    const second = await handleDayItemLate(payload, log);
    expect(second).toMatchObject({ notified: 0, skipped: 2 });
  });

  it('day.incident_raised and day.signoff_due reach the team', async () => {
    const hostId = await makeUser('Incident Host');
    const eventId = await makeEvent(hostId, 'Incident Event');
    const org = await prisma.organization.create({
      data: {
        kind: 'VENDOR',
        name: 'Incident Catering',
        slug: `inc-cat-${Date.now().toString(36)}`,
        countryCode: 'NG',
      },
    });
    orgs.push(org.id);
    const incident = await prisma.incident.create({ data: { eventId, title: 'Power cut' } });
    await handleDayIncidentRaised({ eventId, incidentId: incident.id, ownerUserIds: [] }, log);
    expect(await rowsFor(hostId, 'day.incident_raised')).toHaveLength(1);
    const booking = await prisma.booking.create({
      data: {
        eventId,
        vendorOrgId: org.id,
        category: 'catering',
        status: 'DELIVERED',
        paymentMode: 'OFFLINE',
        totalMinor: 100_000n,
        currency: 'NGN',
      },
    });
    await handleDaySignoffDue({ eventId, bookingId: booking.id }, log);
    expect(await rowsFor(hostId, 'day.signoff_due')).toHaveLength(1);
  });

  it('payment offline flows notify vendor team then host team', async () => {
    const hostId = await makeUser('Pay Host');
    const vendorId = await makeUser('Pay Vendor');
    const eventId = await makeEvent(hostId, 'Pay Event');
    const org = await prisma.organization.create({
      data: { kind: 'VENDOR', name: 'Pay Catering', slug: `pay-cat-${Date.now().toString(36)}`, countryCode: 'NG' },
    });
    orgs.push(org.id);
    await prisma.membership.create({ data: { orgId: org.id, userId: vendorId, role: 'OWNER' } });
    const booking = await prisma.booking.create({
      data: {
        eventId,
        vendorOrgId: org.id,
        category: 'catering',
        status: 'CONFIRMED',
        paymentMode: 'OFFLINE',
        totalMinor: 200_000n,
        currency: 'NGN',
      },
    });
    const milestone = await prisma.paymentMilestone.create({
      data: { bookingId: booking.id, label: 'Deposit', amountMinor: 200_000n, currency: 'NGN', state: 'SCHEDULED' },
    });
    const payment = await prisma.payment.create({
      data: {
        purpose: 'BOOKING_MILESTONE',
        milestoneId: milestone.id,
        payerUserId: hostId,
        amountMinor: 200_000n,
        currency: 'NGN',
        status: 'PENDING',
        mode: 'OFFLINE',
        provider: 'offline',
        providerRef: `payref-${Date.now().toString(36)}`,
      },
    });
    payments.push(payment.id);
    await handlePaymentRecorded({ paymentId: payment.id, bookingId: booking.id, vendorOrgId: org.id }, log);
    expect(await rowsFor(vendorId, 'payment.received')).toHaveLength(1);
    await handlePaymentConfirmed({ paymentId: payment.id, bookingId: booking.id, eventId }, log);
    expect(await rowsFor(hostId, 'payment.received')).toHaveLength(1);
    await handlePaymentDeclined({ paymentId: payment.id, bookingId: booking.id }, log);
    expect(await rowsFor(hostId, 'payment.failed')).toHaveLength(1);
  });

  it('booking and quote topics reach both sides', async () => {
    const hostId = await makeUser('Q Host');
    const vendorId = await makeUser('Q Vendor');
    const eventId = await makeEvent(hostId, 'Q Event');
    const org = await prisma.organization.create({
      data: { kind: 'VENDOR', name: 'Q Catering', slug: `q-cat-${Date.now().toString(36)}`, countryCode: 'NG' },
    });
    orgs.push(org.id);
    await prisma.membership.create({ data: { orgId: org.id, userId: vendorId, role: 'OWNER' } });
    const booking = await prisma.booking.create({
      data: {
        eventId,
        vendorOrgId: org.id,
        category: 'catering',
        status: 'CONFIRMED',
        paymentMode: 'OFFLINE',
        totalMinor: 100_000n,
        currency: 'NGN',
      },
    });
    await handleBookingChanged({ versionId: 'v1', bookingId: booking.id, eventId, vendorOrgId: org.id }, log);
    expect(await rowsFor(hostId, 'booking.changed')).toHaveLength(1);
    expect(await rowsFor(vendorId, 'booking.changed')).toHaveLength(1);
    expect((await rowsFor(vendorId, 'booking.changed'))[0]!.url).toBe(`/bookings/${booking.id}`);
    expect((await rowsFor(hostId, 'booking.changed'))[0]!.url).toBe(`/events/${eventId}/bookings/${booking.id}`);
    // A vendor's extra-money request reaches the host; the decline goes back to the vendor.
    const extra = await prisma.bookingVersion.create({
      data: {
        bookingId: booking.id,
        version: 2,
        status: 'PROPOSED',
        scope: { items: [] },
        totalMinor: booking.totalMinor + 50_000n,
        terms: 'none',
        proposedById: vendorId,
        reason: 'Extra generator',
      },
    });
    await handleChangeRequested({ versionId: extra.id }, log);
    const asked = (await rowsFor(hostId, 'booking.changed'))[0]!;
    expect(asked.title).toBe('Vendor asked to change the booking');
    expect(asked.body).toContain('Extra generator');
    await handleChangeDeclined({ versionId: extra.id }, log);
    expect((await rowsFor(vendorId, 'booking.changed'))[0]!.title).toBe('Change request declined');
    await prisma.notification.deleteMany({ where: { userId: { in: [hostId, vendorId] } } });
    await handleBookingChanged({ versionId: 'v1', bookingId: booking.id, eventId, vendorOrgId: org.id }, log);
    await handleQuoteRequested({ quoteRequestId: 'qr1', eventId, vendorOrgId: org.id, category: 'catering' }, log);
    expect(await rowsFor(vendorId, 'booking.changed')).toHaveLength(2);
    await handleQuoteSent({ quoteId: 'q1', eventId, vendorOrgId: org.id }, log);
    expect((await rowsFor(hostId, 'booking.changed')).length).toBeGreaterThanOrEqual(2);
  });

  it('review received notifies the vendor, reply notifies the event team', async () => {
    const hostId = await makeUser('Rev Host');
    const vendorId = await makeUser('Rev Vendor');
    const eventId = await makeEvent(hostId, 'Rev Event');
    const org = await prisma.organization.create({
      data: { kind: 'VENDOR', name: 'Rev Catering', slug: `rev-cat-${Date.now().toString(36)}`, countryCode: 'NG' },
    });
    orgs.push(org.id);
    await prisma.membership.create({ data: { orgId: org.id, userId: vendorId, role: 'OWNER' } });
    const booking = await prisma.booking.create({
      data: {
        eventId,
        vendorOrgId: org.id,
        category: 'catering',
        status: 'COMPLETED',
        paymentMode: 'OFFLINE',
        totalMinor: 100_000n,
        currency: 'NGN',
      },
    });
    const review = await prisma.review.create({
      data: {
        bookingId: booking.id,
        vendorOrgId: org.id,
        authorId: hostId,
        quality: 5,
        communication: 5,
        punctuality: 5,
        value: 5,
        scope: 5,
        overall: 5,
      },
    });
    await handleReviewReceived({ reviewId: review.id }, log);
    expect(await rowsFor(vendorId, 'review.received')).toHaveLength(1);
    expect(await rowsFor(hostId, 'review.received')).toHaveLength(0);
    await handleReviewReplied({ reviewId: review.id, eventId }, log);
    expect(await rowsFor(hostId, 'review.replied')).toHaveLength(1);
    const again = await handleReviewReceived({ reviewId: review.id }, log);
    expect(again).toMatchObject({ notified: 0 });
  });
});
