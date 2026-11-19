import type { Prisma } from '@tiwa/db';
import { ConflictError } from '../shared/errors.js';

// D-X100: one venue per event day. The venue the host books IS the event's
// venue: booking it rewrites that day's venue on the event (so every page,
// invite, pass and booking shows the place actually booked), and a second
// venue for the same day is refused until the first is cancelled.

type Tx = Prisma.TransactionClient;
const DAY_MS = 86_400_000;

/** Same calendar day (UTC midnight dates, as service dates are stored). */
function sameDay(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / DAY_MS) === Math.floor(b.getTime() / DAY_MS);
}

export async function assertNoOtherVenue(
  tx: Tx,
  input: { eventId: string; vendorOrgId: string; serviceDate: Date | null },
): Promise<void> {
  const active = await tx.booking.findMany({
    where: { eventId: input.eventId, category: 'venue', status: { not: 'CANCELLED' } },
    select: { vendorOrgId: true, serviceDate: true },
  });
  const clash = active.find(
    (row) =>
      row.vendorOrgId !== input.vendorOrgId &&
      (row.serviceDate === null || input.serviceDate === null || sameDay(row.serviceDate, input.serviceDate)),
  );
  if (!clash) return;
  const org = await tx.organization.findUnique({ where: { id: clash.vendorOrgId }, select: { name: true } });
  throw new ConflictError('This event already has a venue booked for that day', {
    key: 'venueAlreadyBooked',
    venue: org?.name ?? '',
  });
}

/** Point the event day at the booked venue (space name + business, and its address). */
export async function syncEventVenue(
  tx: Tx,
  input: { eventId: string; vendorOrgId: string; spaceId: string | null; serviceDate: Date | null },
): Promise<void> {
  const [org, space, days] = await Promise.all([
    tx.organization.findUnique({
      where: { id: input.vendorOrgId },
      select: { name: true, profile: { select: { city: true } } },
    }),
    input.spaceId ? tx.venueSpace.findUnique({ where: { id: input.spaceId }, select: { name: true } }) : null,
    tx.eventDay.findMany({
      where: { eventId: input.eventId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    }),
  ]);
  if (!org) return;
  const venueName = space?.name ? `${space.name}, ${org.name}` : org.name;
  const day =
    (input.serviceDate ? days.find((row) => sameDay(row.date, input.serviceDate as Date)) : undefined) ?? days[0];
  if (day) {
    await tx.eventDay.update({
      where: { id: day.id },
      data: { venueName, ...(org.profile?.city ? { address: org.profile.city } : {}) },
    });
  }
}
