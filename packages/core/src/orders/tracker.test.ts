import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { myEventOrders, stageForBooking, vendorOrders } from './tracker.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const RUN = String(Date.now()).slice(-7);
const users: string[] = [];
let host: UserActor;
let vendorOwner: UserActor;
let outsider: UserActor;
let orgId = '';
let eventId = '';

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

const quoteData = (requestId: string | null, status: 'SENT' | 'ACCEPTED') => ({
  requestId,
  eventId,
  vendorOrgId: orgId,
  status,
  items: [],
  subtotalMinor: 5_000_000n,
  totalMinor: 5_000_000n,
  currency: 'NGN',
  cancellationTerms: 'none',
  proposedSchedule: [],
  expiresAt: new Date('2031-01-01'),
  sentAt: new Date(),
});

beforeAll(async () => {
  host = await makeUser('Tola Host');
  vendorOwner = await makeUser('Vendor Owner');
  outsider = await makeUser('Outsider');
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: `Track Foods ${RUN}`, slug: `track-foods-${RUN}`, countryCode: 'NG' },
  });
  orgId = org.id;
  await prisma.membership.create({ data: { orgId, userId: vendorOwner.userId, role: 'OWNER' } });
  const event = await prisma.event.create({
    data: {
      slug: `track-${RUN}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'ACTIVE',
      name: 'Tola at 40',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      startsAt: new Date('2030-06-01T15:00:00Z'),
      createdById: host.userId,
    },
  });
  eventId = event.id;
  await prisma.eventParticipant.create({
    data: { eventId, userId: host.userId, role: 'HOST', permissions: {} },
  });
  const brief = { notes: 'x' };
  // 1) open request, no quote → requested
  await prisma.quoteRequest.create({
    data: { eventId, category: 'cake', vendorOrgId: orgId, brief, createdById: host.userId },
  });
  // 2) request answered with a sent quote → quoted
  const quoted = await prisma.quoteRequest.create({
    data: { eventId, category: 'catering', vendorOrgId: orgId, brief, createdById: host.userId, status: 'QUOTED' },
  });
  await prisma.quote.create({ data: quoteData(quoted.id, 'SENT') });
  // 3) accepted quote with a booking awaiting deposit → booked
  const booked = await prisma.quoteRequest.create({
    data: { eventId, category: 'dj', vendorOrgId: orgId, brief, createdById: host.userId, status: 'QUOTED' },
  });
  const accepted = await prisma.quote.create({ data: quoteData(booked.id, 'ACCEPTED') });
  await prisma.booking.create({
    data: {
      eventId,
      vendorOrgId: orgId,
      quoteId: accepted.id,
      category: 'dj',
      status: 'DEPOSIT_DUE',
      paymentMode: 'OFFLINE',
      totalMinor: 5_000_000n,
      currency: 'NGN',
    },
  });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { eventId } });
  await prisma.quote.deleteMany({ where: { eventId } });
  await prisma.quoteRequest.deleteMany({ where: { eventId } });
  await prisma.eventParticipant.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('order tracker (D-X35)', () => {
  it('shows a vendor one row per order at its furthest stage, with the client name', async () => {
    const { rows, counts } = await vendorOrders(vendorOwner, { orgId });
    expect(rows).toHaveLength(3);
    expect(counts).toMatchObject({ requested: 1, quoted: 1, booked: 1, confirmed: 0 });
    expect(rows.every((row) => row.counterparty === 'Tola Host' && row.eventName === 'Tola at 40')).toBe(true);
    expect(rows.find((row) => row.stage === 'booked')?.requestId).toBeTruthy();
  });

  it('shows the host the same orders with the business name', async () => {
    const { rows, counts } = await myEventOrders(host);
    const mine = rows.filter((row) => row.eventId === eventId);
    expect(mine).toHaveLength(3);
    expect(mine[0]?.counterparty).toBe(`Track Foods ${RUN}`);
    expect(counts.booked).toBeGreaterThanOrEqual(1);
  });

  it('refuses vendors that are not mine', async () => {
    await expect(vendorOrders(outsider, { orgId })).rejects.toThrow();
    expect((await myEventOrders(outsider)).rows).toEqual([]);
  });

  it('maps booking statuses to stages', () => {
    expect(stageForBooking('CONFIRMED')).toBe('confirmed');
    expect(stageForBooking('DELIVERED')).toBe('delivered');
    expect(stageForBooking('CANCELLED')).toBe('closed');
  });
});
