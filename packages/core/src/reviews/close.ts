import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { assertBookingTransition } from '../bookings/state.js';
import { audit } from '../shared/outbox.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';

// Event close (P14-T02, EVT-11, UF-25): confirm each delivery, reconcile,
// review every vendor, then finish. Bookings follow their machine
// (IN_PROGRESS → DELIVERED here); closing needs every open booking
// delivered or completed, so money never strands mid-flight.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const confirmDeliverySchema = z.object({ bookingId: z.string().uuid() });

/** Host confirms a delivery (IN_PROGRESS → DELIVERED). Review cards unlock
 * once the booking reaches COMPLETED (UF-25-1). */
export async function confirmDelivery(actor: UserActor, raw: z.input<typeof confirmDeliverySchema>) {
  const input = confirmDeliverySchema.parse(raw);
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, eventId: true, status: true, vendorOrgId: true, category: true },
  });
  if (!booking) throw new NotFoundError('Booking not found');
  await requireEventAccess(actor, booking.eventId, 'event.edit');
  assertBookingTransition(booking.status, 'DELIVERED');
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: booking.id }, data: { status: 'DELIVERED' } });
    await audit(tx, {
      actor,
      action: 'booking.delivered',
      targetType: 'Booking',
      targetId: booking.id,
      data: { eventId: booking.eventId },
    });
  });
  return { bookingId: booking.id, eventId: booking.eventId, status: 'DELIVERED' as const };
}

export const closeEventSchema = z.object({ eventId: z.string().uuid() });

/** ACTIVE → COMPLETED (HOST/co-host/planner via `event.close`). Every
 * non-cancelled booking must already be DELIVERED or COMPLETED. */
export async function closeEvent(actor: UserActor, raw: z.input<typeof closeEventSchema>) {
  const input = closeEventSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.close');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    select: { id: true, status: true, name: true },
  });
  if (event.status !== 'ACTIVE') throw new ConflictError('Only an active event can be closed');
  const open = await prisma.booking.findMany({
    where: {
      eventId: input.eventId,
      status: { in: ['ACCEPTED', 'DEPOSIT_DUE', 'CONFIRMED', 'IN_PROGRESS', 'DISPUTED'] },
    },
    select: { id: true, category: true, status: true },
  });
  if (open.length > 0) {
    throw new ConflictError('All bookings must be delivered before closing', {
      pending: open.map((row) => ({ id: row.id, status: row.status })),
    });
  }
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: event.id }, data: { status: 'COMPLETED' } });
    await audit(tx, {
      actor,
      action: 'event.close',
      targetType: 'Event',
      targetId: event.id,
      data: { name: event.name },
    });
  });
  return { eventId: event.id, status: 'COMPLETED' as const };
}

export interface ClosePackBooking {
  bookingId: string;
  vendorOrgId: string;
  vendorName: string;
  category: string;
  status: string;
  totalMinor: string;
  currency: string;
  review: {
    id: string;
    overall: number;
    quality: number;
    communication: number;
    punctuality: number;
    value: number;
    scope: number;
    body: string | null;
    photoIds: string[];
    reply: string | null;
  } | null;
}

/** Everything the close page needs: bookings with vendors, reviews, totals. */
export async function closePack(
  actor: UserActor,
  eventId: string,
): Promise<{ event: { id: string; name: string; status: string }; bookings: ClosePackBooking[] }> {
  await requireEventAccess(actor, eventId, 'event.view');
  const [event, bookings] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true, name: true, status: true } }),
    prisma.booking.findMany({
      where: { eventId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, vendorOrgId: true, category: true, status: true, totalMinor: true, currency: true },
    }),
  ]);
  const [orgs, reviews] = await Promise.all([
    prisma.organization.findMany({
      where: { id: { in: [...new Set(bookings.map((row) => row.vendorOrgId))] } },
      select: { id: true, name: true },
    }),
    prisma.review.findMany({ where: { bookingId: { in: bookings.map((row) => row.id) } } }),
  ]);
  const orgNames = new Map(orgs.map((row) => [row.id, row.name] as const));
  const byBooking = new Map(reviews.map((row) => [row.bookingId, row] as const));
  return {
    event,
    bookings: bookings.map((row) => {
      const review = byBooking.get(row.id);
      return {
        bookingId: row.id,
        vendorOrgId: row.vendorOrgId,
        vendorName: orgNames.get(row.vendorOrgId) ?? '?',
        category: row.category,
        status: row.status,
        totalMinor: row.totalMinor.toString(),
        currency: row.currency,
        review: review
          ? {
              id: review.id,
              overall: review.overall,
              quality: review.quality,
              communication: review.communication,
              punctuality: review.punctuality,
              value: review.value,
              scope: review.scope,
              body: review.body,
              photoIds: review.photoIds,
              reply: review.reply,
            }
          : null,
      };
    }),
  };
}
