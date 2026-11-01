import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { acceptQuote } from '../bookings/accept.js';
import { ensureBookingThread, mirrorToEventTeam, postCard } from './cards.js';
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
let eventId = '';
let orgId = '';
let bookingId = '';

const schedule = [{ label: 'Full', percentBps: 10000, due: 'on_accept' }];

beforeAll(async () => {
  host = await makeUser('CardHost');
  vendor = await makeUser('CardVendorOwner');
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: `cardbiz-${Date.now()}`, slug: `cardbiz-${Date.now()}`, countryCode: 'NG' },
  });
  orgs.push(org.id);
  orgId = org.id;
  await prisma.membership.create({ data: { orgId, userId: vendor.userId, role: 'OWNER' } });
  await prisma.businessProfile.create({
    data: { orgId, categories: ['catering'], city: 'Lagos', currency: 'NGN', published: true },
  });
  const event = await prisma.event.create({
    data: {
      slug: `cards-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Card Party',
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
  await prisma.message.deleteMany({ where: { thread: { eventId: { in: events } } } });
  await prisma.threadParticipant.deleteMany({ where: { thread: { eventId: { in: events } } } });
  await prisma.thread.deleteMany({ where: { eventId: { in: events } } });
  await prisma.paymentMilestone.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.bookingVersion.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
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

describe('booking chat cards', () => {
  it('accept posts quote + booking cards into a reused booking thread', async () => {
    const threadId = await ensureBookingThread(bookingId);
    expect(await ensureBookingThread(bookingId)).toBe(threadId);
    const cards = await prisma.message.findMany({
      where: { threadId, kind: 'CARD' },
      orderBy: { createdAt: 'asc' },
      select: { card: true },
    });
    expect(cards.map((row) => (row.card as { type: string }).type)).toEqual(['quote', 'booking']);
    const thread = await prisma.thread.findUniqueOrThrow({
      where: { id: threadId },
      include: { participants: { select: { userId: true, orgId: true, side: true } } },
    });
    expect(thread.participants).toHaveLength(2);
    expect(thread.bookingId).toBe(bookingId);
    await postCard(host, { threadId, type: 'change', refId: 'x' });
    expect(await prisma.message.count({ where: { threadId } })).toBe(3);
  });

  it('mirrors into the event-team thread only when one exists', async () => {
    await mirrorToEventTeam(host, eventId, 'quote', 'nope');
    const team = await prisma.thread.create({
      data: {
        kind: 'EVENT',
        context: 'EVENT_TEAM',
        eventId,
        createdById: host.userId,
        lastMessageAt: new Date(),
        participants: { create: [{ userId: host.userId, side: 'TEAM' }] },
      },
      select: { id: true },
    });
    await mirrorToEventTeam(host, eventId, 'quote', 'abc');
    const cards = await prisma.message.findMany({ where: { threadId: team.id, kind: 'CARD' } });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.card).toEqual({ type: 'quote', id: 'abc' });
  });
});
