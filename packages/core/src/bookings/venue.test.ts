import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { ConflictError, ValidationError } from '../shared/errors.js';
import { sendQuote, updateQuote } from '../quotes/quotes.js';
import { requestQuotes } from '../quotes/requests.js';
import { acceptQuote } from './accept.js';
import { expireHolds, instantBook } from './venue.js';
import { requestBookingChange } from './changes.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

const schedule = [{ label: 'Full', percentBps: 10000, due: 'on_accept' }];

let host: UserActor;
let vendor: UserActor;
let eventId = '';
let orgId = '';
let spaceId = '';

const DATE_A = '2027-03-10';
const DATE_B = '2027-03-11';

async function makeVenueQuote(date = DATE_A) {
  const req = await requestQuotes(host, { eventId, category: 'venue', vendorOrgIds: [orgId] }).catch(async () => {
    const existing = await prisma.quoteRequest.findFirstOrThrow({
      where: { eventId, category: 'venue', vendorOrgId: orgId },
    });
    return { requests: [{ id: existing.id }], brief: {} as never };
  });
  const created = await prisma.quote.create({
    data: {
      requestId: req.requests[0]!.id as string,
      eventId,
      vendorOrgId: orgId,
      spaceId,
      serviceDate: new Date(date),
      slot: 'FULL_DAY',
      items: [{ name: 'Grand Hall', qty: 1, unitMinor: '5000000' }],
      taxBps: 0,
      serviceBps: 0,
      travelFeeMinor: 0n,
      subtotalMinor: 5_000_000n,
      totalMinor: 5_000_000n,
      currency: 'NGN',
      cancellationTerms: 'none',
      proposedSchedule: schedule,
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'DRAFT',
    },
    select: { id: true },
  });
  await sendQuote(vendor, { quoteId: created.id });
  return created.id;
}

beforeAll(async () => {
  host = await makeUser('VenueHost');
  vendor = await makeUser('VenueOwner');
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: `venuebiz-${Date.now()}`, slug: `venuebiz-${Date.now()}`, countryCode: 'NG' },
  });
  orgs.push(org.id);
  orgId = org.id;
  await prisma.membership.create({ data: { orgId, userId: vendor.userId, role: 'OWNER' } });
  const profile = await prisma.businessProfile.create({
    data: { orgId, categories: ['venue'], city: 'Lagos', currency: 'NGN', published: true },
  });
  const space = await prisma.venueSpace.create({
    data: {
      profileId: profile.id,
      name: 'Grand Hall',
      slotPrices: { FULL_DAY: '5000000', EVENING: '3000000' },
    },
  });
  spaceId = space.id;
  const event = await prisma.event.create({
    data: {
      slug: `venue-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Venue Party',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      createdById: host.userId,
    },
  });
  events.push(event.id);
  eventId = event.id;
  await prisma.eventParticipant.create({
    data: { eventId, userId: host.userId, role: 'HOST', permissions: toStoredPermissions(permissionsFor('HOST')) },
  });
});

afterAll(async () => {
  await prisma.availabilityBlock.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.paymentMilestone.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.bookingVersion.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.venueSpace.deleteMany({ where: { profile: { orgId: { in: orgs } } } });
  for (const id of orgs) {
    await prisma.businessProfile.deleteMany({ where: { orgId: id } });
    await prisma.membership.deleteMany({ where: { orgId: id } });
    await prisma.organization.delete({ where: { id } });
  }
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('venue bookings', () => {
  it('accepting a venue quote holds the date in the same transaction', async () => {
    const quoteId = await makeVenueQuote(DATE_A);
    const result = await acceptQuote(host, { quoteId, paymentMode: 'DIRECT', declineOthers: false });
    const block = await prisma.availabilityBlock.findFirst({ where: { bookingId: result.bookingId } });
    expect(block?.slot).toBe('FULL_DAY');
    // A second booking for the same slot is refused.
    const other = await makeVenueQuote(DATE_A);
    await expect(acceptQuote(host, { quoteId: other, paymentMode: 'DIRECT' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('instant book creates booking, milestone and block', async () => {
    const result = await instantBook(host, {
      eventId,
      vendorOrgId: orgId,
      spaceId,
      serviceDate: DATE_B,
      slot: 'EVENING',
      paymentMode: 'DIRECT',
      terms: 'No refund within 7 days',
    });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: result.bookingId },
      include: { milestones: true },
    });
    expect(booking.totalMinor).toBe(3_000_000n);
    expect(booking.quoteId).toBeNull();
    expect(booking.milestones).toHaveLength(1);
    await expect(
      instantBook(host, {
        eventId,
        vendorOrgId: orgId,
        spaceId,
        serviceDate: DATE_B,
        slot: 'EVENING',
        paymentMode: 'DIRECT',
        terms: 'x'.repeat(10),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('moving a venue booking onto a taken date is refused', async () => {
    const booking = await prisma.booking.findFirstOrThrow({
      where: { eventId, category: 'venue', serviceDate: new Date(DATE_B) },
    });
    await expect(
      requestBookingChange(host, {
        bookingId: booking.id,
        scope: {
          items: [{ name: 'Grand Hall', qty: 1, unitMinor: '3000000' }],
          notes: null,
          serviceDate: DATE_A,
          slot: 'FULL_DAY',
          spaceId,
        },
        reason: 'Move to the busy day',
      }),
    ).rejects.toThrow();
  });

  it('expired holds cancel and free the date', async () => {
    const booking = await prisma.booking.findFirstOrThrow({ where: { eventId, serviceDate: new Date(DATE_A) } });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'DEPOSIT_DUE', holdExpiresAt: new Date(Date.now() - 1000) },
    });
    const result = await expireHolds(new Date());
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED');
    expect(await prisma.availabilityBlock.findFirst({ where: { bookingId: booking.id } })).toBeNull();
  });

  it('vendor can edit an unsent quote; slot moves re-check availability', async () => {
    const draft = await prisma.quote.create({
      data: {
        eventId,
        vendorOrgId: orgId,
        spaceId,
        serviceDate: new Date(DATE_B),
        slot: 'MORNING',
        items: [{ name: 'Hall', qty: 1, unitMinor: '1000000' }],
        taxBps: 0,
        serviceBps: 0,
        travelFeeMinor: 0n,
        subtotalMinor: 1_000_000n,
        totalMinor: 1_000_000n,
        currency: 'NGN',
        cancellationTerms: 'none',
        proposedSchedule: schedule,
        expiresAt: new Date(Date.now() + 86_400_000),
        status: 'DRAFT',
      },
      select: { id: true },
    });
    const edited = await updateQuote(vendor, {
      quoteId: draft.id,
      items: [{ name: 'Hall', qty: 2, unitMinor: '1000000' }],
    });
    expect(edited.totalMinor).toBe('2000000');
    // DATE_B EVENING is held by the instant booking: moving onto it is refused.
    await expect(
      updateQuote(vendor, { quoteId: draft.id, serviceDate: DATE_B, slot: 'EVENING' as const }),
    ).rejects.toBeInstanceOf(ConflictError);
    await sendQuote(vendor, { quoteId: draft.id });
    await expect(updateQuote(vendor, { quoteId: draft.id, notes: 'late edit' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
