import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { acceptQuote } from './accept.js';
import { getBooking, getVendorBrief, listEventBookings } from './queries.js';
import { requestQuotes } from '../quotes/requests.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

let host: UserActor;
let vendor: UserActor;
let outsider: UserActor;
let eventId = '';
let orgId = '';
let bookingId = '';

const schedule = [
  { label: 'Deposit', percentBps: 5000, due: 'on_accept' },
  { label: 'Balance', percentBps: 5000, due: 'days_before:7' },
];

beforeAll(async () => {
  host = await makeUser('BookHost');
  vendor = await makeUser('BookVendorOwner');
  outsider = await makeUser('BookOutsider');
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: `briefbiz-${Date.now()}`, slug: `briefbiz-${Date.now()}`, countryCode: 'NG' },
  });
  orgs.push(org.id);
  orgId = org.id;
  await prisma.membership.create({ data: { orgId, userId: vendor.userId, role: 'OWNER' } });
  await prisma.businessProfile.create({
    data: { orgId, categories: ['catering'], city: 'Lagos', currency: 'NGN', published: true },
  });
  const event = await prisma.event.create({
    data: {
      slug: `booking-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Book Party',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      createdById: host.userId,
    },
  });
  events.push(event.id);
  eventId = event.id;
  await prisma.eventParticipant.create({
    data: { eventId, userId: host.userId, role: 'HOST', permissions: { preset: 'host', approveUpToMinor: null } },
  });
  const req = await requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [orgId] });
  const quote = await prisma.quote.create({
    data: {
      requestId: req.requests[0]!.id as string,
      eventId,
      vendorOrgId: orgId,
      items: [{ name: 'Rice', qty: 10, unitMinor: '100000' }],
      taxBps: 0,
      serviceBps: 0,
      travelFeeMinor: 0n,
      subtotalMinor: 1_000_000n,
      totalMinor: 1_000_000n,
      currency: 'NGN',
      cancellationTerms: 'none',
      proposedSchedule: schedule,
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'SENT',
      sentAt: new Date(),
    },
    select: { id: true },
  });
  const accepted = await acceptQuote(host, { quoteId: quote.id, paymentMode: 'DIRECT', declineOthers: false });
  bookingId = accepted.bookingId;
});

afterAll(async () => {
  await prisma.paymentMilestone.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.bookingVersion.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
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

describe('booking reads', () => {
  it('host sees versions and milestones; vendor sees own booking only', async () => {
    const full = await getBooking(host, { bookingId });
    expect(full.booking.versions).toHaveLength(1);
    expect(full.booking.milestones).toHaveLength(2);
    expect(full.viewer).toBe('host');
    const own = await getBooking(vendor, { bookingId });
    expect(own.viewer).toBe('vendor');
    expect(own.booking.milestones).toHaveLength(2);
  });

  it('outsiders and other vendors get NOT_FOUND', async () => {
    await expect(getBooking(outsider, { bookingId })).rejects.toThrow();
  });

  it('lists event bookings for the host', async () => {
    const rows = await listEventBookings(host, { eventId });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.vendorName).toBeTruthy();
  });

  it('vendor brief carries event context but never guest contacts', async () => {
    await prisma.guest.create({
      data: { eventId, name: 'Secret Guest', phone: '+2348012345678', email: 'secret@example.com' },
    });
    const brief = await getVendorBrief(vendor, { bookingId });
    expect(brief.event.name).toBe('Book Party');
    expect(brief.booking.milestones).toHaveLength(2);
    expect(JSON.stringify(brief)).not.toMatch(/Secret Guest|2348012345678|secret@example/);
    await expect(getVendorBrief(host, { bookingId })).rejects.toThrow();
  });
});
