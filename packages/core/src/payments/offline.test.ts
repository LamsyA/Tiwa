import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { acceptQuote } from '../bookings/accept.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { requestQuotes } from '../quotes/requests.js';
import {
  confirmOfflinePayment,
  declineOfflinePayment,
  listBookingPayments,
  listPendingOfflinePayments,
  recordOfflinePayment,
} from './offline.js';
import { bookingMoney, listVendorBookingMoney } from './status.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const events: string[] = [];
let orgId = '';
let eventId = '';
let host: UserActor;
let vendor: UserActor;
let stranger: UserActor;

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeBooking(paymentMode: 'DIRECT' | 'OFFLINE' | 'HELD' = 'OFFLINE') {
  const req = await requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [orgId] }).catch(async () => {
    const existing = await prisma.quoteRequest.findFirstOrThrow({
      where: { eventId, category: 'catering', vendorOrgId: orgId },
    });
    return { requests: [{ id: existing.id }] };
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
      subtotalMinor: 1_000_000n,
      totalMinor: 1_000_000n,
      currency: 'NGN',
      cancellationTerms: 'none',
      proposedSchedule: [
        { label: 'Deposit', percentBps: 3000, due: 'on_accept' },
        { label: 'Balance', percentBps: 7000, due: 'days_before:7' },
      ],
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'SENT',
      sentAt: new Date(),
    },
    select: { id: true },
  });
  const { bookingId } = await acceptQuote(host, { quoteId: quote.id, paymentMode, declineOthers: false });
  const milestones = await prisma.paymentMilestone.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'asc' },
  });
  return { bookingId, deposit: milestones[0]!, balance: milestones[1]! };
}

const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  host = await makeUser('OfflineHost');
  vendor = await makeUser('OfflineVendor');
  stranger = await makeUser('OfflineStranger');
  const stamp = Date.now();
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: `offlinebiz-${stamp}`, slug: `offlinebiz-${stamp}`, countryCode: 'NG' },
  });
  orgId = org.id;
  await prisma.membership.create({ data: { orgId, userId: vendor.userId, role: 'OWNER' } });
  await prisma.businessProfile.create({
    data: { orgId, categories: ['catering'], city: 'Lagos', currency: 'NGN', published: true },
  });
  const event = await prisma.event.create({
    data: {
      slug: `offline-${stamp}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Offline Party',
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
  await prisma.payment.deleteMany({ where: { milestone: { booking: { eventId: { in: events } } } } });
  await prisma.paymentMilestone.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.bookingVersion.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.businessProfile.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('offline payments (UF-17 step 5)', () => {
  it('record → vendor confirms → deposit CONFIRMED_OFFLINE and booking CONFIRMED with hold cleared', async () => {
    const { bookingId, deposit } = await makeBooking();
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('DEPOSIT_DUE');

    const { paymentId } = await recordOfflinePayment(null, host, {
      milestoneId: deposit.id,
      amountMinor: deposit.amountMinor.toString(),
      paidOn: today,
      method: 'bank_transfer',
    });
    expect((await prisma.paymentMilestone.findUniqueOrThrow({ where: { id: deposit.id } })).state).toBe(
      'RECORDED_OFFLINE',
    );
    const pending = await listPendingOfflinePayments(vendor, { vendorOrgId: orgId });
    expect(pending.map((row) => row.id)).toContain(paymentId);

    const result = await confirmOfflinePayment(vendor, { paymentId });
    expect(result.bookingStatus).toBe('CONFIRMED');
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { milestones: true } });
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.holdExpiresAt).toBeNull();
    expect(booking.milestones.find((row) => row.id === deposit.id)?.state).toBe('CONFIRMED_OFFLINE');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.confirmedById).toBe(vendor.userId);

    const money = bookingMoney(booking.milestones);
    expect(money.securedMinor).toBe(300_000n);
    expect(money.outstandingMinor).toBe(700_000n);
    expect((await listBookingPayments(bookingId))[0]?.status).toBe('SUCCEEDED');

    const vendorView = (await listVendorBookingMoney(vendor, { vendorOrgId: orgId })).find(
      (row) => row.id === bookingId,
    );
    expect(vendorView).toMatchObject({ status: 'CONFIRMED', securedMinor: '300000', outstandingMinor: '700000' });
    await expect(listVendorBookingMoney(stranger, { vendorOrgId: orgId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a later milestone confirms without changing booking status; a DIRECT booking can be paid offline', async () => {
    const { bookingId, deposit, balance } = await makeBooking('DIRECT');
    const first = await recordOfflinePayment(null, host, {
      milestoneId: deposit.id,
      amountMinor: deposit.amountMinor.toString(),
      paidOn: today,
      method: 'cash',
    });
    await confirmOfflinePayment(vendor, first);
    const second = await recordOfflinePayment(null, host, {
      milestoneId: balance.id,
      amountMinor: balance.amountMinor.toString(),
      paidOn: today,
      method: 'pos',
    });
    expect((await confirmOfflinePayment(vendor, second)).bookingStatus).toBe('CONFIRMED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('CONFIRMED');
  });

  it('refuses a double record, a wrong amount, a future date and a HELD booking', async () => {
    const { deposit, balance } = await makeBooking();
    const base = { milestoneId: deposit.id, amountMinor: deposit.amountMinor.toString(), paidOn: today };
    await expect(recordOfflinePayment(null, host, { ...base, amountMinor: '1', method: 'cash' })).rejects.toMatchObject(
      { details: { key: 'amountMismatch' } },
    );
    await expect(
      recordOfflinePayment(null, host, { ...base, paidOn: '2999-01-01', method: 'cash' }),
    ).rejects.toMatchObject({ details: { key: 'futureDate' } });
    await expect(
      recordOfflinePayment(null, host, {
        ...base,
        milestoneId: balance.id,
        amountMinor: balance.amountMinor.toString(),
        method: 'cash',
        receiptKey: 'events/other/receipt',
      }),
    ).rejects.toMatchObject({ details: { key: 'invalidReceipt' } });
    const results = await Promise.allSettled([
      recordOfflinePayment(null, host, { ...base, method: 'cash' }),
      recordOfflinePayment(null, host, { ...base, method: 'cash' }),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.payment.count({ where: { milestoneId: deposit.id } })).toBe(1);

    const held = await makeBooking('HELD');
    await expect(
      recordOfflinePayment(null, host, {
        milestoneId: held.deposit.id,
        amountMinor: held.deposit.amountMinor.toString(),
        paidOn: today,
        method: 'cash',
      }),
    ).rejects.toMatchObject({ details: { key: 'heldNotOffline' } });
  });

  it('only the host side records and only the vendor team confirms; strangers get NOT_FOUND', async () => {
    const { deposit } = await makeBooking();
    const input = {
      milestoneId: deposit.id,
      amountMinor: deposit.amountMinor.toString(),
      paidOn: today,
      method: 'cash' as const,
    };
    await expect(recordOfflinePayment(null, stranger, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(recordOfflinePayment(null, vendor, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const { paymentId } = await recordOfflinePayment(null, host, input);
    await expect(confirmOfflinePayment(stranger, { paymentId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(confirmOfflinePayment(host, { paymentId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(listPendingOfflinePayments(stranger, { vendorOrgId: orgId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('"not received" puts the milestone back to SCHEDULED so the host can record again', async () => {
    const { bookingId, deposit } = await makeBooking();
    const input = {
      milestoneId: deposit.id,
      amountMinor: deposit.amountMinor.toString(),
      paidOn: today,
      method: 'bank_transfer' as const,
    };
    const first = await recordOfflinePayment(null, host, input);
    await declineOfflinePayment(vendor, first);
    expect((await prisma.paymentMilestone.findUniqueOrThrow({ where: { id: deposit.id } })).state).toBe('SCHEDULED');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: first.paymentId } })).status).toBe('FAILED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('DEPOSIT_DUE');
    await expect(confirmOfflinePayment(vendor, first)).rejects.toMatchObject({ details: { key: 'notAwaiting' } });
    await recordOfflinePayment(null, host, input);
  });
});

describe('bookingMoney', () => {
  it('splits milestones into secured, awaiting and outstanding, skipping refunds', () => {
    const money = bookingMoney([
      { state: 'CONFIRMED_OFFLINE', amountMinor: 100n },
      { state: 'PAID_DIRECT', amountMinor: '50' },
      { state: 'RECORDED_OFFLINE', amountMinor: 30n },
      { state: 'SCHEDULED', amountMinor: 20n },
      { state: 'REFUNDED', amountMinor: 999n },
    ]);
    expect(money).toEqual({ totalMinor: 200n, securedMinor: 150n, awaitingMinor: 30n, outstandingMinor: 20n });
  });
});
