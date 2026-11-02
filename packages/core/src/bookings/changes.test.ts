import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { acceptQuote } from './accept.js';
import {
  describeChange,
  diffScopes,
  listPendingChanges,
  requestBookingChange,
  respondBookingChange,
} from './changes.js';
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

const schedule = [
  { label: 'Deposit', percentBps: 5000, due: 'on_accept' },
  { label: 'Balance', percentBps: 5000, due: 'days_before:7' },
];

let host: UserActor;
let vendor: UserActor;
let eventId = '';
let orgId = '';
let bookingId = '';

async function makeBooking(totalMinor = 1_000_000n): Promise<string> {
  const req = await requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [orgId] }).catch(async () => {
    const existing = await prisma.quoteRequest.findFirstOrThrow({
      where: { eventId, category: 'catering', vendorOrgId: orgId },
    });
    return { requests: [{ id: existing.id }], brief: {} as never };
  });
  const quote = await prisma.quote.create({
    data: {
      requestId: req.requests[0]!.id as string,
      eventId,
      vendorOrgId: orgId,
      items: [{ name: 'Rice', qty: 10, unitMinor: '100000' }],
      taxBps: 0,
      serviceBps: 0,
      travelFeeMinor: 0n,
      subtotalMinor: totalMinor,
      totalMinor,
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
  return accepted.bookingId;
}

beforeAll(async () => {
  host = await makeUser('ChangeHost');
  vendor = await makeUser('ChangeVendorOwner');
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: `changebiz-${Date.now()}`, slug: `changebiz-${Date.now()}`, countryCode: 'NG' },
  });
  orgs.push(org.id);
  orgId = org.id;
  await prisma.membership.create({ data: { orgId, userId: vendor.userId, role: 'OWNER' } });
  await prisma.businessProfile.create({
    data: { orgId, categories: ['catering'], city: 'Lagos', currency: 'NGN', published: true },
  });
  const event = await prisma.event.create({
    data: {
      slug: `change-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Change Party',
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
  bookingId = await makeBooking();
});

afterAll(async () => {
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

const changedScope = {
  items: [{ name: 'Rice', qty: 20, unitMinor: '100000' }],
  notes: null,
  serviceDate: null,
  slot: null,
  spaceId: null,
};

describe('booking change requests', () => {
  it('vendor proposes, host accepts: version N+1 in force, old readable (UF-19-1)', async () => {
    const proposed = await requestBookingChange(vendor, { bookingId, scope: changedScope, reason: 'Double portions' });
    expect(proposed.version).toBe(2);
    // Total unchanged until acceptance (UF-19-2).
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).totalMinor).toBe(1_000_000n);
    const decided = await respondBookingChange(
      host,
      { versionId: proposed.versionId, accept: true },
      { ip: '9.9.9.9' },
    );
    expect(decided.status).toBe('ACCEPTED');
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { versions: true } });
    expect(booking.totalMinor).toBe(2_000_000n);
    expect(booking.currentVersion).toBe(2);
    expect(booking.versions.find((row) => row.version === 1)?.status).toBe('SUPERSEDED');
    expect(booking.versions.find((row) => row.version === 1)?.totalMinor).toBe(1_000_000n);
    const milestones = await prisma.paymentMilestone.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
    const sum = milestones.reduce((total, row) => total + row.amountMinor, 0n);
    expect(sum).toBe(2_000_000n);
  });

  it('proposer cannot accept their own request; decline keeps the old version', async () => {
    const second = await makeBooking();
    const proposed = await requestBookingChange(host, {
      bookingId: second,
      scope: { ...changedScope, notes: 'Extra decor' },
      reason: 'Add decor',
    });
    await expect(respondBookingChange(host, { versionId: proposed.versionId, accept: true })).rejects.toThrow();
    const declined = await respondBookingChange(vendor, { versionId: proposed.versionId, accept: false });
    expect(declined.status).toBe('DECLINED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: second } })).totalMinor).toBe(1_000_000n);
  });

  it('rejects a second pending proposal while one waits', async () => {
    const third = await makeBooking();
    await requestBookingChange(host, { bookingId: third, scope: changedScope, reason: 'First' });
    await expect(
      requestBookingChange(vendor, { bookingId: third, scope: changedScope, reason: 'Second' }),
    ).rejects.toThrow();
  });

  it('diffScopes reports price and field moves', () => {
    const diff = diffScopes(
      { items: [{ name: 'A' }], notes: null, serviceDate: null, slot: null, totalMinor: '100' },
      { items: [{ name: 'A' }, { name: 'B' }], notes: 'hi', serviceDate: '2026-12-01', slot: null, totalMinor: '250' },
    );
    expect(diff.totalDiffMinor).toBe('150');
    expect(diff.itemsChanged).toBe(true);
    expect(diff.notesChanged).toBe(true);
    expect(diff.dateChanged).toBe(true);
    expect(diff.slotChanged).toBe(false);
  });

  it('vendor sees what the host asked for, item by item, and who asked', async () => {
    const fourth = await makeBooking();
    await requestBookingChange(host, {
      bookingId: fourth,
      scope: {
        ...changedScope,
        items: [
          { name: 'Rice', qty: 12, unitMinor: '100000' },
          { name: 'Small chops', qty: 50, unitMinor: '2000' },
        ],
        serviceDate: '2026-12-20',
      },
      reason: 'Two more tables',
    });
    const rows = await listPendingChanges(vendor, { vendorOrgId: orgId });
    const row = rows.find((item) => item.booking.id === fourth)!;
    expect(row.proposedBy).toBe('host');
    expect(row.mine).toBe(false);
    expect(row.reason).toBe('Two more tables');
    expect(row.summary.lines.map((line) => [line.name, line.kind])).toEqual([
      ['Rice', 'changed'],
      ['Small chops', 'added'],
    ]);
    expect(row.summary.date).toEqual({ before: null, after: '2026-12-20' });
    expect(row.summary.diffMinor).toBe('300000');
  });

  it('a lower total comes off the unpaid milestones without empty rows', async () => {
    const fifth = await makeBooking();
    const proposed = await requestBookingChange(vendor, {
      bookingId: fifth,
      scope: { ...changedScope, items: [{ name: 'Rice', qty: 3, unitMinor: '100000' }] },
      reason: 'Smaller crowd',
    });
    await respondBookingChange(host, { versionId: proposed.versionId, accept: true });
    const milestones = await prisma.paymentMilestone.findMany({ where: { bookingId: fifth } });
    expect(milestones).toHaveLength(2);
    expect(milestones.reduce((total, row) => total + row.amountMinor, 0n)).toBe(300_000n);
    expect(milestones.every((row) => row.amountMinor >= 0n)).toBe(true);
  });

  it('describeChange lists removed items and leaves unchanged fields out', () => {
    const summary = describeChange(
      {
        items: [
          { name: 'Cake', qty: 1, unitMinor: '500' },
          { name: 'DJ', qty: 1, unitMinor: '900' },
        ],
        totalMinor: '1400',
      },
      { items: [{ name: 'cake ', qty: 1, unitMinor: '500' }], totalMinor: '500' },
    );
    expect(summary.lines.map((line) => line.kind)).toEqual(['same', 'removed']);
    expect(summary.date).toBeNull();
    expect(summary.notes).toBeNull();
    expect(summary.diffMinor).toBe('-900');
  });
});
