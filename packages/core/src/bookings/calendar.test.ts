import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { requestQuotes } from '../quotes/requests.js';
import { acceptQuote } from './accept.js';

// D-X43: accepting a booking blocks a one-event-a-day vendor's calendar on the
// event date, refuses a second booking that day, and leaves caterers open.

type UserActor = { kind: 'user'; userId: string; isAdmin: false };
const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeEvent(host: UserActor, name: string) {
  const event = await prisma.event.create({
    data: {
      slug: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name,
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      startsAt: new Date('2031-05-10T15:00:00Z'),
      createdById: host.userId,
    },
  });
  events.push(event.id);
  await prisma.eventParticipant.create({
    data: {
      eventId: event.id,
      userId: host.userId,
      role: 'HOST',
      permissions: toStoredPermissions(permissionsFor('HOST')),
    },
  });
  return event.id;
}

async function makeVendor(category: string) {
  const org = await prisma.organization.create({
    data: {
      kind: 'VENDOR',
      name: `${category} biz`,
      slug: `${category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      countryCode: 'NG',
    },
  });
  orgs.push(org.id);
  await prisma.businessProfile.create({
    data: { orgId: org.id, categories: [category], city: 'Lagos', currency: 'NGN', published: true },
  });
  return org.id;
}

async function quoteFor(host: UserActor, eventId: string, orgId: string, category: string) {
  const req = await requestQuotes(host, { eventId, category, vendorOrgIds: [orgId] });
  const quote = await prisma.quote.create({
    data: {
      requestId: req.requests[0]!.id as string,
      eventId,
      vendorOrgId: orgId,
      items: [{ name: 'Service', qty: 1, unitMinor: '100000' }],
      subtotalMinor: 100_000n,
      totalMinor: 100_000n,
      currency: 'NGN',
      cancellationTerms: 'none',
      proposedSchedule: [{ label: 'Full', percentBps: 10000, due: 'on_accept' }],
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'SENT',
      sentAt: new Date(),
    },
  });
  return quote.id;
}

let host: UserActor;
beforeAll(async () => {
  host = await makeUser('Calendar Host');
});

afterAll(async () => {
  const bookings = await prisma.booking.findMany({ where: { eventId: { in: events } }, select: { id: true } });
  await prisma.availabilityBlock.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.paymentMilestone.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
  await prisma.bookingVersion.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.businessProfile.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('vendor calendars (D-X43)', () => {
  it('a DJ booking blocks the event date and a second booking that day is refused', async () => {
    const dj = await makeVendor('dj');
    const first = await makeEvent(host, 'First party');
    const accepted = await acceptQuote(host, {
      quoteId: await quoteFor(host, first, dj, 'dj'),
      paymentMode: 'DIRECT',
      declineOthers: false,
    });
    const blocks = await prisma.availabilityBlock.findMany({ where: { orgId: dj } });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.bookingId).toBe(accepted.bookingId);
    expect(blocks[0]!.date.toISOString().slice(0, 10)).toBe('2031-05-10');

    const second = await makeEvent(host, 'Same day party');
    await expect(
      acceptQuote(host, {
        quoteId: await quoteFor(host, second, dj, 'dj'),
        paymentMode: 'DIRECT',
        declineOthers: false,
      }),
    ).rejects.toThrow();
  });

  it('a caterer stays open for other events on the same day', async () => {
    const caterer = await makeVendor('catering');
    const eventId = await makeEvent(host, 'Food party');
    await acceptQuote(host, {
      quoteId: await quoteFor(host, eventId, caterer, 'catering'),
      paymentMode: 'DIRECT',
      declineOthers: false,
    });
    expect(await prisma.availabilityBlock.count({ where: { orgId: caterer } })).toBe(0);
  });
});
