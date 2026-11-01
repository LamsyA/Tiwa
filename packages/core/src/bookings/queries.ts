import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize } from '../auth/authorize.js';
import type { Actor } from '../auth/authorize.js';
import { loadEventAccess } from '../events/access.js';
import { NotFoundError } from '../shared/errors.js';

// Booking reads (P7-T07): the host side sees everything on the event; a
// vendor sees only their own booking (matrix `own` rules), never the event's
// other vendors. Money movement itself stays read-only until P8.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const bookingIdSchema = z.object({ bookingId: z.string().uuid() });

function bigintsToStrings<T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T {
  const out = { ...row };
  for (const key of keys) {
    const value = out[key];
    if (typeof value === 'bigint') (out as Record<string, unknown>)[key as string] = value.toString();
  }
  return out;
}

export async function getBooking(actor: UserActor, raw: z.infer<typeof bookingIdSchema>) {
  const { bookingId } = bookingIdSchema.parse(raw);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      versions: { orderBy: { version: 'asc' } },
      milestones: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!booking) throw new NotFoundError('Booking not found');

  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: booking.vendorOrgId },
    select: { role: true },
  });
  let viewer: 'host' | 'vendor' = 'host';
  if (membership) {
    viewer = 'vendor';
  } else {
    const access = await loadEventAccess(actor.userId, booking.eventId);
    if (!access) throw new NotFoundError('Booking not found');
    if (access.role === 'VENDOR' || access.role === 'PHOTOGRAPHER') throw new NotFoundError('Booking not found');
    authorize(actor, 'event.view', { eventId: booking.eventId, access });
  }

  const [org, event, thread] = await Promise.all([
    prisma.organization.findUnique({ where: { id: booking.vendorOrgId }, select: { name: true, slug: true } }),
    prisma.event.findUniqueOrThrow({
      where: { id: booking.eventId },
      select: { name: true, type: true, startsAt: true, endsAt: true, timezone: true, currency: true },
    }),
    prisma.thread.findFirst({
      where: { kind: 'BOOKING', context: 'BOOKING', contextId: bookingId },
      select: { id: true },
    }),
  ]);

  return {
    viewer,
    booking: {
      ...bigintsToStrings(booking, ['totalMinor']),
      versions: booking.versions.map((version) => bigintsToStrings(version, ['totalMinor'])),
      milestones: booking.milestones.map((milestone) => bigintsToStrings(milestone, ['amountMinor'])),
    },
    vendor: org,
    event,
    threadId: thread?.id ?? null,
  };
}

export const listEventBookingsSchema = z.object({ eventId: z.string().uuid() });

/** Host-side booking list for the event (future bookings tab source). */
export async function listEventBookings(actor: UserActor, raw: z.infer<typeof listEventBookingsSchema>) {
  const { eventId } = listEventBookingsSchema.parse(raw);
  const access = await loadEventAccess(actor.userId, eventId);
  if (!access) throw new NotFoundError('Event not found');
  if (access.role === 'VENDOR' || access.role === 'PHOTOGRAPHER') throw new NotFoundError('Event not found');
  authorize(actor, 'event.view', { eventId, access });
  const bookings = await prisma.booking.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, vendorOrgId: true, category: true, status: true, paymentMode: true, totalMinor: true, currency: true },
  });
  const orgs = await prisma.organization.findMany({
    where: { id: { in: [...new Set(bookings.map((row) => row.vendorOrgId))] } },
    select: { id: true, name: true },
  });
  const names = new Map(orgs.map((org) => [org.id, org.name]));
  return bookings.map((row) => ({ ...row, totalMinor: row.totalMinor.toString(), vendorName: names.get(row.vendorOrgId) ?? null }));
}

export const vendorBriefSchema = z.object({ bookingId: z.string().uuid() });

/**
 * Booking brief for vendors (QTE-08, P7-T09): date, venue, times, headcount,
 * scope and schedule. Built only from event and booking rows — guest names,
 * phones and emails are never queried, so they cannot leak (P4 redaction).
 */
export async function getVendorBrief(actor: UserActor, raw: z.infer<typeof vendorBriefSchema>) {
  const { bookingId } = vendorBriefSchema.parse(raw);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { milestones: { orderBy: { createdAt: 'asc' } } },
  });
  if (!booking) throw new NotFoundError('Booking not found');
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: booking.vendorOrgId },
    select: { role: true },
  });
  if (!membership) throw new NotFoundError('Booking not found');

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: booking.eventId },
    select: {
      name: true,
      type: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      expectedGuests: true,
      currency: true,
      days: { orderBy: { date: 'asc' }, take: 3, select: { date: true, title: true, venueName: true, address: true } },
    },
  });
  return {
    event: { ...event, days: event.days.map((day) => ({ ...day, date: day.date.toISOString() })) },
    booking: {
      id: booking.id,
      category: booking.category,
      status: booking.status,
      serviceDate: booking.serviceDate?.toISOString() ?? null,
      slot: booking.slot,
      totalMinor: booking.totalMinor.toString(),
      currency: booking.currency,
      milestones: booking.milestones.map((milestone) => ({
        label: milestone.label,
        amountMinor: milestone.amountMinor.toString(),
        currency: milestone.currency,
        dueAt: milestone.dueAt?.toISOString() ?? null,
        state: milestone.state,
      })),
    },
  };
}
