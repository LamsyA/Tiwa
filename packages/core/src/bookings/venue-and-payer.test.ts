import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { listPaymentSchedule } from '../budget/records.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { createEventDraft } from '../events/commands.js';
import { declineOfflinePayment, recordOfflinePayment } from '../payments/offline.js';
import { assertNoOtherVenue, syncEventVenue } from './venue-guard.js';

// D-X100: one venue per event day (and it becomes the event's venue); on a
// planner-run event only the planner pays vendors; a vendor's "not received"
// shows as such to the event team.
const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];

async function user(name: string) {
  const row = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(row.id);
  return { kind: 'user' as const, userId: row.id, isAdmin: false };
}
async function org(name: string) {
  const row = await prisma.organization.create({
    data: { kind: 'VENDOR', name, slug: `x100-${Date.now().toString(36)}-${orgs.length}`, countryCode: 'NG' },
  });
  orgs.push(row.id);
  return row.id;
}

afterAll(async () => {
  const bookings = await prisma.booking.findMany({ where: { eventId: { in: events } }, select: { id: true } });
  const ids = bookings.map((b) => b.id);
  await prisma.payment.deleteMany({ where: { milestone: { bookingId: { in: ids } } } });
  await prisma.paymentMilestone.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { id: { in: ids } } });
  await prisma.outboxEvent.deleteMany({
    where: { OR: events.map((id) => ({ payload: { path: ['eventId'], equals: id } })) },
  });
  await prisma.auditLog.deleteMany({ where: { OR: [{ targetId: { in: events } }, { actorId: { in: users } }] } });
  await prisma.eventDay.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('D-X100', () => {
  it('a booked venue becomes the event venue, and a second venue that day is refused', async () => {
    const host = await user('Venue Host');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const date = new Date('2031-05-10T00:00:00Z');
    await prisma.eventDay.create({ data: { eventId, date, venueName: 'Typed Place' } });
    const hall = await org('Pippy Hall');
    const other = await org('Lekki Palms');
    await prisma.$transaction(async (tx) => {
      await assertNoOtherVenue(tx, { eventId, vendorOrgId: hall, serviceDate: date });
      await syncEventVenue(tx, { eventId, vendorOrgId: hall, spaceId: null, serviceDate: date });
      await tx.booking.create({
        data: {
          eventId,
          vendorOrgId: hall,
          category: 'venue',
          status: 'ACCEPTED',
          paymentMode: 'OFFLINE',
          totalMinor: 100n,
          currency: 'NGN',
          serviceDate: date,
        },
      });
    });
    const day = await prisma.eventDay.findFirstOrThrow({ where: { eventId } });
    expect(day.venueName).toBe('Pippy Hall');
    await expect(
      prisma.$transaction((tx) => assertNoOtherVenue(tx, { eventId, vendorOrgId: other, serviceDate: date })),
    ).rejects.toMatchObject({ details: { key: 'venueAlreadyBooked' } });
  });

  it('on a planner-run event the host cannot pay a vendor, the planner can, and "not received" shows', async () => {
    const host = await user('Pay Host');
    const planner = await user('Pay Planner');
    const vendor = await user('Pay Vendor');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    await prisma.event.update({ where: { id: eventId }, data: { status: 'ACTIVE' } });
    await prisma.eventParticipant.create({
      data: {
        eventId,
        userId: planner.userId,
        role: 'PLANNER',
        permissions: toStoredPermissions(permissionsFor('PLANNER', 'full')),
        acceptedAt: new Date(),
      },
    });
    const caterer = await org('Jollof Co');
    await prisma.membership.create({ data: { orgId: caterer, userId: vendor.userId, role: 'OWNER' } });
    const booking = await prisma.booking.create({
      data: {
        eventId,
        vendorOrgId: caterer,
        category: 'catering',
        status: 'CONFIRMED',
        paymentMode: 'OFFLINE',
        totalMinor: 50_000n,
        currency: 'NGN',
      },
    });
    const milestone = await prisma.paymentMilestone.create({
      data: { bookingId: booking.id, label: 'Deposit', amountMinor: 50_000n, currency: 'NGN', state: 'SCHEDULED' },
    });
    const pay = {
      milestoneId: milestone.id,
      amountMinor: '50000',
      paidOn: '2026-11-18',
      method: 'bank_transfer' as const,
    };

    await expect(recordOfflinePayment(null, host, pay)).rejects.toMatchObject({ details: { key: 'plannerPays' } });
    await recordOfflinePayment(null, planner, pay);

    const pending = await prisma.payment.findFirstOrThrow({ where: { milestoneId: milestone.id } });
    await declineOfflinePayment(vendor, { paymentId: pending.id });
    const schedule = await listPaymentSchedule(host, { eventId });
    const row = schedule.find((r) => r.id === milestone.id)!;
    expect(row.state).toBe('SCHEDULED');
    expect(row.declinedAt).not.toBeNull();
    expect(row.paidBy).toBeNull();
  });
});
