import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { budgetSummary } from '../budget/summary.js';
import { getBooking, listEventBookings } from '../bookings/queries.js';
import { compareQuotes } from '../quotes/decisions.js';
import { setVendorPriceVisibility } from './prices.js';

// EVT-12 (P10-T10): the planner's hide switch redacts vendor amounts for the
// host side on the server — nothing reaches the browser. Real-DB test: one
// event, host + planner participants, one vendor booking with a quote.

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];

const TOTAL = 7_777_777n;
const MILESTONE = 3_888_888n;

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

let host: UserActor;
let planner: UserActor;
let vendorOwner: UserActor;
let eventId = '';
let vendorOrgId = '';
let bookingId = '';

beforeAll(async () => {
  host = await makeUser('PriceHost');
  planner = await makeUser('PricePlanner');
  vendorOwner = await makeUser('PriceVendor');
  const plannerOrg = await prisma.organization.create({
    data: { kind: 'PLANNER', name: `priceplan-${Date.now()}`, slug: `priceplan-${Date.now()}`, countryCode: 'NG' },
  });
  const vendorOrg = await prisma.organization.create({
    data: { kind: 'VENDOR', name: `pricevend-${Date.now()}`, slug: `pricevend-${Date.now()}`, countryCode: 'NG' },
  });
  orgs.push(plannerOrg.id, vendorOrg.id);
  vendorOrgId = vendorOrg.id;
  await prisma.membership.create({ data: { orgId: plannerOrg.id, userId: planner.userId, role: 'OWNER' } });
  await prisma.membership.create({ data: { orgId: vendorOrg.id, userId: vendorOwner.userId, role: 'OWNER' } });

  const event = await prisma.event.create({
    data: {
      slug: `pricehide-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Price Party',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      createdById: host.userId,
    },
  });
  events.push(event.id);
  eventId = event.id;
  await prisma.eventParticipant.create({
    data: { eventId, userId: host.userId, role: 'HOST', permissions: {} },
  });
  await prisma.eventParticipant.create({
    data: { eventId, userId: planner.userId, orgId: plannerOrg.id, role: 'PLANNER', permissions: {} },
  });

  await prisma.quote.create({
    data: {
      eventId,
      vendorOrgId,
      items: [{ name: 'Cake', qty: 1, unitMinor: TOTAL.toString() }],
      taxBps: 0,
      serviceBps: 0,
      travelFeeMinor: 0n,
      subtotalMinor: TOTAL,
      totalMinor: TOTAL,
      currency: 'NGN',
      cancellationTerms: 'none',
      proposedSchedule: [{ label: 'Full', percentBps: 10000, due: 'on_accept' }],
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'SENT',
      sentAt: new Date(),
    },
  });

  const booking = await prisma.booking.create({
    data: {
      eventId,
      vendorOrgId,
      category: 'catering',
      status: 'ACCEPTED',
      paymentMode: 'OFFLINE',
      totalMinor: TOTAL,
      currency: 'NGN',
      versions: {
        create: {
          version: 1,
          status: 'ACCEPTED',
          scope: { items: [{ name: 'Cake', qty: 1, unitMinor: TOTAL.toString() }] },
          totalMinor: TOTAL,
          terms: 'terms',
          proposedById: host.userId,
        },
      },
      milestones: {
        create: { label: 'Deposit', amountMinor: MILESTONE, currency: 'NGN', state: 'SCHEDULED' },
      },
    },
  });
  bookingId = booking.id;
});

afterAll(async () => {
  await prisma.paymentMilestone.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.bookingVersion.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.budgetCategory.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('vendor price visibility (EVT-12)', () => {
  it('host sees full amounts while visible', async () => {
    const quote = (await compareQuotes(host, { eventId }))[0]!;
    expect(quote.totalMinor).toBe(TOTAL.toString());
    const booking = await getBooking(host, { bookingId });
    expect((booking.booking as { totalMinor: string }).totalMinor).toBe(TOTAL.toString());
  });

  it('only the planner team may flip the switch', async () => {
    await expect(setVendorPriceVisibility(host, { eventId, visible: false })).rejects.toThrow();
    const updated = await setVendorPriceVisibility(planner, { eventId, visible: false });
    expect(updated.hostCanSeeVendorPrices).toBe(false);
  });

  it('host payloads carry no vendor amounts once hidden', async () => {
    const quotes = await compareQuotes(host, { eventId });
    expect(quotes[0]).toMatchObject({ totalMinor: null, pricesHidden: true });
    expect(JSON.stringify(quotes)).not.toContain(TOTAL.toString());

    const booking = await getBooking(host, { bookingId });
    const view = booking.booking as unknown as {
      totalMinor: string | null;
      versions: { totalMinor: string | null; scope: unknown }[];
      milestones: { amountMinor: string | null }[];
      pricesHidden: true;
    };
    expect(view.totalMinor).toBeNull();
    expect(view.pricesHidden).toBe(true);
    expect(view.versions[0]!.totalMinor).toBeNull();
    expect(view.versions[0]!.scope).toBeNull();
    expect(view.milestones[0]!.amountMinor).toBeNull();
    expect(JSON.stringify(booking)).not.toContain(TOTAL.toString());
    expect(JSON.stringify(booking)).not.toContain(MILESTONE.toString());

    const list = await listEventBookings(host, { eventId });
    expect(list[0]).toMatchObject({ totalMinor: null, pricesHidden: true });

    const summary = await budgetSummary(host, { eventId });
    expect('pricesHidden' in summary && summary.pricesHidden).toBe(true);
    const line = summary.lines.find((row) => row.bookings.length > 0)!;
    expect(line.bookings[0]!.committedMinor).toBeNull();
    // Aggregates stay: the host still sees their own total spend.
    expect(summary.totals.committedMinor).toBe(TOTAL);
  });

  it('planner and vendor teams still see full figures while hidden', async () => {
    const quote = (await compareQuotes(planner, { eventId }))[0]!;
    expect(quote.totalMinor).toBe(TOTAL.toString());
    const vendorBooking = await getBooking(vendorOwner, { bookingId });
    expect((vendorBooking.booking as { totalMinor: string }).totalMinor).toBe(TOTAL.toString());
  });
});
