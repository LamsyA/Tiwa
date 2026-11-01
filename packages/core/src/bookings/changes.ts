import { prisma, Prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize, type Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { loadEventAccess } from '../events/access.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';
import { calcQuoteTotals, quoteItemSchema } from '../quotes/totals.js';
import { checkVenueAvailability } from './venue.js';
import { ensureBookingThread, mirrorToEventTeam, postCard } from '../chat/cards.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('bookings');

// Booking change requests (QTE-07, UF-19): a change request is a PROPOSED
// BookingVersion (D-D03). Accepting makes it the ACCEPTED version (N+1) and
// supersedes the old one; old versions stay readable and unchanged
// (UF-19-1), and the booking total only moves on acceptance (UF-19-2).
// Venue date/slot re-availability is re-checked in T10 (UF-29 edge).

type UserActor = Extract<Actor, { kind: 'user' }>;

export const bookingScopeSchema = z.object({
  items: z.array(quoteItemSchema).min(1, 'itemsRequired').max(100, 'itemsTooMany'),
  notes: z.string().max(4000, 'notesTooLong').nullable(),
  serviceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid')
    .nullable(),
  slot: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY']).nullable(),
  spaceId: z.string().uuid().nullable(),
});

export type BookingScope = z.infer<typeof bookingScopeSchema>;

interface Side {
  side: 'host' | 'vendor';
}

async function bookingSide(actor: UserActor, eventId: string, vendorOrgId: string): Promise<Side> {
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: vendorOrgId },
    select: { role: true },
  });
  if (membership) {
    authorizeOrg(actor, 'org.manage', vendorOrgId, { orgId: vendorOrgId, role: membership.role });
    return { side: 'vendor' };
  }
  const access = await loadEventAccess(actor.userId, eventId);
  if (!access) throw new NotFoundError('Booking not found');
  if (access.role === 'VENDOR' || access.role === 'PHOTOGRAPHER') throw new NotFoundError('Booking not found');
  authorize(actor, 'event.edit', { eventId, access });
  return { side: 'host' };
}

export const requestChangeSchema = z.object({
  bookingId: z.string().uuid(),
  scope: bookingScopeSchema,
  reason: z.string().trim().min(1, 'reasonRequired').max(2000, 'reasonTooLong'),
});

export async function requestBookingChange(actor: UserActor, raw: z.infer<typeof requestChangeSchema>) {
  const input = requestChangeSchema.parse(raw);
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: { versions: { where: { status: 'ACCEPTED' }, orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!booking) throw new NotFoundError('Booking not found');
  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED' || booking.status === 'DISPUTED') {
    throw new ValidationError('This booking can no longer change', { key: 'bookingClosed' });
  }
  const { side } = await bookingSide(actor, booking.eventId, booking.vendorOrgId);
  const pending = await prisma.bookingVersion.findFirst({
    where: { bookingId: booking.id, status: 'PROPOSED' },
    select: { id: true },
  });
  if (pending) throw new ConflictError('A change request is already waiting for a decision', { versionId: pending.id });

  const current = booking.versions[0];
  if (!current) throw new ValidationError('Booking has no current version', { key: 'noVersion' });
  const currentScope = current.scope as unknown as {
    taxBps: number;
    serviceBps: number;
    travelFeeMinor: string;
    schedule: unknown;
    quoteId: string | null;
  };
  const totals = calcQuoteTotals(
    input.scope.items,
    currentScope.taxBps ?? 0,
    currentScope.serviceBps ?? 0,
    currentScope.travelFeeMinor ?? '0',
  );

  // Venue date/space/slot moves re-check availability (UF-29 edge, P7-T10).
  const isVenue = booking.spaceId !== null || booking.category === 'venue';
  const currentDate = booking.serviceDate?.toISOString().slice(0, 10) ?? null;
  const moved =
    (input.scope.serviceDate ?? null) !== currentDate ||
    (input.scope.slot ?? null) !== booking.slot ||
    (input.scope.spaceId ?? null) !== booking.spaceId;
  if (isVenue && moved) {
    const date = input.scope.serviceDate ? new Date(input.scope.serviceDate) : booking.serviceDate;
    if (!date || !input.scope.slot) {
      throw new ValidationError('Venue bookings need a date and a slot', { key: 'slotRequired' });
    }
    await checkVenueAvailability(
      prisma,
      {
        vendorOrgId: booking.vendorOrgId,
        spaceId: input.scope.spaceId ?? booking.spaceId,
        date,
        slot: input.scope.slot,
      },
      { ignoreBookingId: booking.id },
    );
  }

  let version;
  try {
    version = await prisma.bookingVersion.create({
      data: {
        bookingId: booking.id,
        version: booking.currentVersion + 1,
        status: 'PROPOSED',
        scope: {
          ...input.scope,
          schedule: currentScope.schedule,
          quoteId: currentScope.quoteId,
          taxBps: currentScope.taxBps ?? 0,
          serviceBps: currentScope.serviceBps ?? 0,
          travelFeeMinor: currentScope.travelFeeMinor ?? '0',
        } as unknown as Prisma.InputJsonValue,
        totalMinor: totals.totalMinor,
        terms: current.terms,
        proposedById: actor.userId,
        reason: input.reason,
      },
      select: { id: true, version: true, totalMinor: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('A change request is already waiting for a decision');
    }
    throw error;
  }
  await audit(prisma, {
    actor,
    action: 'booking.requestChange',
    targetType: 'BookingVersion',
    targetId: version.id,
    data: { eventId: booking.eventId, side },
  });
  await enqueue(prisma, 'booking.change_requested', {
    versionId: version.id,
    bookingId: booking.id,
    eventId: booking.eventId,
    vendorOrgId: booking.vendorOrgId,
    side,
  });
  return { versionId: version.id, version: version.version, totalMinor: totals.totalMinor.toString() };
}

export const respondChangeSchema = z.object({
  versionId: z.string().uuid(),
  accept: z.boolean(),
});

export async function respondBookingChange(
  actor: UserActor,
  raw: z.infer<typeof respondChangeSchema>,
  opts?: { ip?: string },
) {
  const input = respondChangeSchema.parse(raw);
  const version = await prisma.bookingVersion.findUnique({
    where: { id: input.versionId },
    include: { booking: true },
  });
  if (!version) throw new NotFoundError('Change request not found');
  if (version.status !== 'PROPOSED')
    throw new ValidationError('This request was already decided', { key: 'alreadyDecided' });
  if (version.proposedById === actor.userId) {
    throw new ForbiddenError('The other side decides on a change request');
  }
  const { side } = await bookingSide(actor, version.booking.eventId, version.booking.vendorOrgId);
  const now = new Date();

  if (!input.accept) {
    await prisma.bookingVersion.update({ where: { id: version.id }, data: { status: 'DECLINED', decidedAt: now } });
    await audit(prisma, {
      actor,
      action: 'booking.declineChange',
      targetType: 'BookingVersion',
      targetId: version.id,
      data: { eventId: version.booking.eventId, side },
    });
    await enqueue(prisma, 'booking.change_declined', {
      versionId: version.id,
      bookingId: version.bookingId,
      eventId: version.booking.eventId,
    });
    try {
      await postCard(actor, {
        threadId: await ensureBookingThread(version.bookingId),
        type: 'change',
        refId: version.id,
        snapshot: { version: version.version },
      });
    } catch (error) {
      log.warn(
        { err: error instanceof Error ? error.message : String(error), versionId: version.id },
        'change card failed',
      );
    }
    return { status: 'DECLINED' as const };
  }

  const scope = version.scope as unknown as BookingScope;
  const diff = version.totalMinor - version.booking.totalMinor;
  return prisma
    .$transaction(async (tx) => {
      const current = await tx.bookingVersion.findFirst({
        where: { bookingId: version.bookingId, status: 'ACCEPTED' },
        select: { id: true },
      });
      if (current) {
        await tx.bookingVersion.update({ where: { id: current.id }, data: { status: 'SUPERSEDED' } });
      }
      const isVendor = side === 'vendor';
      await tx.bookingVersion.update({
        where: { id: version.id },
        data: {
          status: 'ACCEPTED',
          decidedAt: now,
          ...(isVendor
            ? { acceptedByVendorId: actor.userId, acceptedByVendorAt: now }
            : { acceptedByHostId: actor.userId, acceptedByHostAt: now, acceptedByHostIp: opts?.ip ?? null }),
        },
      });
      await tx.booking.update({
        where: { id: version.bookingId },
        data: {
          currentVersion: version.version,
          totalMinor: version.totalMinor,
          serviceDate: scope.serviceDate ? new Date(scope.serviceDate) : null,
          slot: scope.slot,
          spaceId: scope.spaceId,
        },
      });
      {
        // A venue date/space/slot move carries the availability block with it.
        const wasVenue = version.booking.spaceId !== null || version.booking.category === 'venue';
        const newDate = scope.serviceDate ? new Date(scope.serviceDate) : null;
        const movedVenue =
          wasVenue &&
          ((scope.serviceDate ?? null) !== (version.booking.serviceDate?.toISOString().slice(0, 10) ?? null) ||
            (scope.slot ?? null) !== version.booking.slot ||
            (scope.spaceId ?? null) !== version.booking.spaceId);
        if (movedVenue) {
          if (!newDate || !scope.slot)
            throw new ValidationError('Venue bookings need a date and a slot', { key: 'slotRequired' });
          await checkVenueAvailability(
            tx,
            {
              vendorOrgId: version.booking.vendorOrgId,
              spaceId: scope.spaceId ?? version.booking.spaceId,
              date: newDate,
              slot: scope.slot,
            },
            { ignoreBookingId: version.bookingId },
          );
          await tx.availabilityBlock.deleteMany({ where: { bookingId: version.bookingId } });
          try {
            await tx.availabilityBlock.create({
              data: {
                orgId: version.booking.vendorOrgId,
                spaceId: scope.spaceId ?? version.booking.spaceId,
                date: newDate,
                slot: scope.slot,
                bookingId: version.bookingId,
              },
            });
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              throw new ConflictError('That date was just booked', { key: 'slotTaken' });
            }
            throw error;
          }
        }
      }
      if (diff !== 0n) {
        // UF-19: the extra (or reduced) amount lands on the next unpaid
        // milestone, or a new one when everything is already scheduled.
        const next = await tx.paymentMilestone.findFirst({
          where: { bookingId: version.bookingId, state: 'SCHEDULED' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, amountMinor: true },
        });
        if (next) {
          const adjusted = next.amountMinor + diff;
          await tx.paymentMilestone.update({
            where: { id: next.id },
            data: { amountMinor: adjusted < 0n ? 0n : adjusted },
          });
        } else {
          await tx.paymentMilestone.create({
            data: {
              bookingId: version.bookingId,
              kind: 'PAYMENT',
              label: diff > 0n ? 'Balance adjustment' : 'Reduction',
              amountMinor: diff > 0n ? diff : 0n,
              currency: version.booking.currency,
              dueAt: now,
              releaseRule: 'ON_PAYMENT',
            },
          });
        }
      }
      await audit(tx, {
        actor,
        action: 'booking.acceptChange',
        targetType: 'BookingVersion',
        targetId: version.id,
        data: { eventId: version.booking.eventId, side },
        ...(opts?.ip ? { ip: opts.ip } : {}),
      });
      await enqueue(tx, 'booking.changed', {
        versionId: version.id,
        bookingId: version.bookingId,
        eventId: version.booking.eventId,
        vendorOrgId: version.booking.vendorOrgId,
      });
      return { status: 'ACCEPTED' as const, version: version.version };
    })
    .then(async (result) => {
      if (result.status === 'ACCEPTED') {
        try {
          await postCard(actor, {
            threadId: await ensureBookingThread(version.bookingId),
            type: 'change',
            refId: version.id,
            snapshot: {
              version: version.version,
              diffMinor: (version.totalMinor - version.booking.totalMinor).toString(),
              currency: version.booking.currency,
            },
          });
          await mirrorToEventTeam(actor, version.booking.eventId, 'change', version.id);
        } catch (error) {
          log.warn(
            { err: error instanceof Error ? error.message : String(error), versionId: version.id },
            'change card failed',
          );
        }
      }
      return result;
    });
}

export interface ScopeDiff {
  totalDiffMinor: string;
  itemsChanged: boolean;
  notesChanged: boolean;
  dateChanged: boolean;
  slotChanged: boolean;
}

export const listPendingChangesSchema = z.object({ vendorOrgId: z.string().uuid() });

/** Vendor's incoming change requests (their bookings' PROPOSED versions). */
export async function listPendingChanges(actor: UserActor, raw: z.infer<typeof listPendingChangesSchema>) {
  const { vendorOrgId } = listPendingChangesSchema.parse(raw);
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: vendorOrgId },
    select: { role: true },
  });
  if (!membership) throw new ForbiddenError('Only the vendor team lists change requests');
  const versions = await prisma.bookingVersion.findMany({
    where: { status: 'PROPOSED', booking: { vendorOrgId } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      version: true,
      totalMinor: true,
      reason: true,
      scope: true,
      booking: { select: { id: true, eventId: true, event: { select: { name: true } } } },
    },
  });
  return versions.map((row) => ({ ...row, totalMinor: row.totalMinor.toString() }));
}

/** Old vs new for the diff view (UF-19): price difference plus what moved. */
export function diffScopes(
  oldScope: {
    items: unknown;
    notes: string | null;
    serviceDate: string | null;
    slot: string | null;
    totalMinor: string;
  },
  newScope: {
    items: unknown;
    notes: string | null;
    serviceDate: string | null;
    slot: string | null;
    totalMinor: string;
  },
): ScopeDiff {
  return {
    totalDiffMinor: (BigInt(newScope.totalMinor) - BigInt(oldScope.totalMinor)).toString(),
    itemsChanged: JSON.stringify(oldScope.items) !== JSON.stringify(newScope.items),
    notesChanged: (oldScope.notes ?? null) !== (newScope.notes ?? null),
    dateChanged: (oldScope.serviceDate ?? null) !== (newScope.serviceDate ?? null),
    slotChanged: (oldScope.slot ?? null) !== (newScope.slot ?? null),
  };
}
