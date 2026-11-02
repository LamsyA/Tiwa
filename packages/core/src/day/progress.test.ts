// P12-T07: bookings start on their service date; sign-off prompts queue
// after the event.
import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from '../shared/ids.js';
import { progressDueBookings, promptDueSignoffs } from './progress.js';

const events: string[] = [];

beforeAll(async () => {
  const host = await prisma.user.create({ data: { name: 'P12 Progress Host', countryCode: 'NG' } });
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'P12 Progress Catering', slug: `p12-prog-${Date.now().toString(36)}`, countryCode: 'NG' },
  });
  const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const event = await prisma.event.create({
    data: {
      id: uuidv7(),
      slug: `p12-progress-${Date.now().toString(36)}`,
      type: 'conference',
      format: 'CORPORATE',
      status: 'ACTIVE',
      name: 'P12 Progress Event',
      visibility: 'PRIVATE',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      startsAt: past,
      endsAt: new Date(past.getTime() + 2 * 60 * 60 * 1000),
      createdById: host.id,
    },
  });
  events.push(event.id);
  await prisma.booking.create({
    data: {
      id: uuidv7(),
      eventId: event.id,
      vendorOrgId: org.id,
      category: 'catering',
      status: 'CONFIRMED',
      paymentMode: 'OFFLINE',
      totalMinor: 100_000n,
      currency: 'NGN',
      serviceDate: past,
    },
  });
  await prisma.booking.create({
    data: {
      id: uuidv7(),
      eventId: event.id,
      vendorOrgId: org.id,
      category: 'decor',
      status: 'DELIVERED',
      paymentMode: 'OFFLINE',
      totalMinor: 50_000n,
      currency: 'NGN',
      serviceDate: past,
    },
  });
});

afterAll(async () => {
    await prisma.vendorCheckIn.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: events } } }).catch(() => undefined);
});

describe('booking progress (P12-T07)', () => {
  it('starts due bookings and prompts sign-off after the event', async () => {
    const hostId = (
      await prisma.event.findUniqueOrThrow({ where: { id: events[0]! }, select: { createdById: true } })
    ).createdById;
    const started = await progressDueBookings(new Date());
    expect(started.started).toBe(1);
    const moved = await prisma.booking.findMany({ where: { eventId: events[0]! }, select: { category: true, status: true } });
    expect(moved.find((row) => row.category === 'catering')?.status).toBe('IN_PROGRESS');
    const prompted = await promptDueSignoffs(new Date());
    expect(prompted.prompted).toBe(2);
    const stub = await prisma.outboxEvent.findFirst({
      where: { topic: 'day.signoff_due' },
      orderBy: { createdAt: 'desc' },
    });
    expect(stub).toBeTruthy();
    expect((stub!.payload as { eventId: string }).eventId).toBe(events[0]!);
    await prisma.user.deleteMany({ where: { id: hostId } }).catch(() => undefined);
  });
});
