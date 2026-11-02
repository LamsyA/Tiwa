import { prisma } from '@tiwa/db';
import type { Actor } from '../auth/authorize.js';
import { audit, enqueue } from '../shared/outbox.js';

// Booking progress + sign-off prompts (P12-T07, DAY-08; feeds the release
// engine in P8). The worker runs this hourly: bookings whose service date
// has come move CONFIRMED → IN_PROGRESS, and bookings still awaiting
// delivery sign-off after their event queue a `day.signoff_due` stub for
// P13 `notify()`.

type SystemActor = Extract<Actor, { kind: 'system' }>;

const SYSTEM: SystemActor = { kind: 'system' };

/** CONFIRMED bookings whose service date has arrived start work. Bookings
 * without a service date fall back to the event start. */
export async function progressDueBookings(now: Date = new Date()): Promise<{ started: number }> {
  const events = await prisma.event.findMany({
    where: { status: 'ACTIVE', startsAt: { lte: now } },
    select: { id: true, startsAt: true },
  });
  const eventStart = new Map(events.map((row) => [row.id, row.startsAt]));
  const candidates = await prisma.booking.findMany({
    where: { eventId: { in: [...eventStart.keys()] }, status: 'CONFIRMED' },
    select: { id: true, eventId: true, serviceDate: true },
    take: 500,
  });
  const ready = candidates.filter((row) => {
    const start = row.serviceDate ?? eventStart.get(row.eventId);
    return start !== undefined && start !== null && start <= now;
  });
  let started = 0;
  for (const row of ready) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: row.id, status: 'CONFIRMED' },
        data: { status: 'IN_PROGRESS' },
      });
      if (updated.count === 0) return;
      await audit(tx, {
        actor: SYSTEM,
        action: 'day.booking.progress',
        targetType: 'Booking',
        targetId: row.id,
        data: { eventId: row.eventId, from: 'CONFIRMED', to: 'IN_PROGRESS' },
      });
      started += 1;
    });
  }
  return { started };
}

/** Prompt delivery sign-off once the event is over (P12-T07): bookings in
 * IN_PROGRESS or DELIVERED without sign-off queue one stub each. P13
 * delivers the prompt; the sign-off buttons themselves live on money. */
export async function promptDueSignoffs(now: Date = new Date()): Promise<{ prompted: number }> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: {
      status: { in: ['ACTIVE', 'COMPLETED'] },
      OR: [{ endsAt: { lte: dayAgo } }, { endsAt: null, startsAt: { lte: dayAgo } }],
    },
    select: { id: true },
    take: 200,
  });
  if (events.length === 0) return { prompted: 0 };
  const bookings = await prisma.booking.findMany({
    where: {
      eventId: { in: events.map((row) => row.id) },
      status: { in: ['IN_PROGRESS', 'DELIVERED'] },
      signedOffAt: null,
    },
    select: { id: true, eventId: true },
    take: 500,
  });
  let prompted = 0;
  for (const row of bookings) {
    await prisma.$transaction(async (tx) => {
      await enqueue(tx, 'day.signoff_due', { eventId: row.eventId, bookingId: row.id });
      await audit(tx, {
        actor: SYSTEM,
        action: 'day.signoff.prompt',
        targetType: 'Booking',
        targetId: row.id,
        data: { eventId: row.eventId },
      });
      prompted += 1;
    });
  }
  return { prompted };
}
