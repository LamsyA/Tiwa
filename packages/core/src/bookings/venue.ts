import { prisma, Prisma } from '@tiwa/db';
import { z } from 'zod';
import { requireEventAccess } from '../events/access.js';
import type { Actor } from '../auth/authorize.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';
import { ensureBookingThread, postCard, mirrorToEventTeam } from '../chat/cards.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('bookings');

// Venue bookings (QTE-06, P7-T10): a venue quote accepted — or an instant
// booking — creates the Booking AND the AvailabilityBlock in one
// transaction, so the date can never be double-booked. Changing a venue
// date/space/slot re-checks availability first (UF-29 edge); an expired
// deposit hold frees the date again (bookings/expire-holds job).

type UserActor = Extract<Actor, { kind: 'user' }>;

type BlockReader = {
  availabilityBlock: {
    findFirst: (args: {
      where: Record<string, unknown>;
      select: { id: true; bookingId: true; slot: true };
    }) => Promise<{ id: string; bookingId: string | null; slot: string } | null>;
  };
};

export interface VenueSlot {
  vendorOrgId: string;
  spaceId: string | null;
  date: Date;
  slot: string;
}

/** True when two blocks for the same org/space/date overlap. */
export function slotsOverlap(a: string, b: string): boolean {
  return a === 'FULL_DAY' || b === 'FULL_DAY' || a === b;
}

/**
 * Refuse a venue slot that is already blocked (by another booking, hold or
 * manual block). `ignoreBookingId` lets a booking re-check its own slot
 * while changing to a different one.
 */
export async function checkVenueAvailability(
  db: BlockReader,
  slot: VenueSlot,
  opts?: { ignoreBookingId?: string },
): Promise<void> {
  const clash = await db.availabilityBlock.findFirst({
    where: {
      orgId: slot.vendorOrgId,
      spaceId: slot.spaceId,
      date: slot.date,
      ...(opts?.ignoreBookingId ? { NOT: { bookingId: opts.ignoreBookingId } } : {}),
    },
    select: { id: true, bookingId: true, slot: true },
  });
  if (clash && slotsOverlap(clash.slot, slot.slot)) {
    throw new ConflictError('That date is already booked', { key: 'slotTaken' });
  }
}

async function requireVenueOrg(vendorOrgId: string, spaceId: string | null) {
  const org = await prisma.organization.findUnique({
    where: { id: vendorOrgId },
    select: { kind: true, profile: { select: { categories: true } } },
  });
  if (!org || org.kind !== 'VENDOR' || !org.profile?.categories.includes('venue')) {
    throw new ValidationError('Venue bookings need a venue business', { key: 'notVenue' });
  }
  if (spaceId) {
    const space = await prisma.venueSpace.findFirst({
      where: { id: spaceId, profile: { orgId: vendorOrgId }, active: true },
    });
    if (!space) throw new NotFoundError('Space not found');
    return space;
  }
  return null;
}

export const instantBookSchema = z.object({
  eventId: z.string().uuid(),
  vendorOrgId: z.string().uuid(),
  spaceId: z.string().uuid().optional(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid'),
  slot: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY']).default('FULL_DAY'),
  paymentMode: z.enum(['DIRECT', 'OFFLINE']),
  terms: z.string().trim().min(1, 'termsRequired').max(4000, 'termsTooLong'),
});

/** Instant booking (QTE-06): no quote step; price comes from the space's slot price. */
export async function instantBook(actor: UserActor, raw: z.infer<typeof instantBookSchema>) {
  const input = instantBookSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const space = await requireVenueOrg(input.vendorOrgId, input.spaceId ?? null);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { currency: true } });

  let totalMinor = 0n;
  if (space) {
    const prices = space.slotPrices as unknown as Record<string, string | undefined>;
    const price = prices[input.slot] ?? prices.FULL_DAY;
    if (!price || !/^\d+$/.test(price)) {
      throw new ValidationError('No price set for that slot', { key: 'noSlotPrice' });
    }
    totalMinor = BigInt(price);
  } else {
    throw new ValidationError('Pick a space to book', { key: 'spaceRequired' });
  }

  const date = new Date(input.serviceDate);
  return prisma
    .$transaction(async (tx) => {
      await checkVenueAvailability(tx, {
        vendorOrgId: input.vendorOrgId,
        spaceId: input.spaceId ?? null,
        date,
        slot: input.slot,
      });
      const booking = await tx.booking.create({
        data: {
          eventId: input.eventId,
          vendorOrgId: input.vendorOrgId,
          quoteId: null,
          category: 'venue',
          spaceId: input.spaceId ?? null,
          serviceDate: date,
          slot: input.slot,
          status: 'ACCEPTED',
          paymentMode: input.paymentMode,
          totalMinor,
          currency: event.currency,
        },
        select: { id: true },
      });
      await tx.bookingVersion.create({
        data: {
          bookingId: booking.id,
          version: 1,
          status: 'ACCEPTED',
          scope: {
            items: [{ name: space.name, qty: 1, unitMinor: totalMinor.toString() }],
            notes: null,
            schedule: [{ label: 'Full payment', percentBps: 10000, due: 'on_accept' }],
            spaceId: input.spaceId ?? null,
            serviceDate: input.serviceDate,
            slot: input.slot,
            quoteId: null,
            taxBps: 0,
            serviceBps: 0,
            travelFeeMinor: '0',
            instant: true,
          },
          totalMinor,
          terms: input.terms,
          proposedById: actor.userId,
          decidedAt: new Date(),
          acceptedByHostId: actor.userId,
          acceptedByHostAt: new Date(),
        },
      });
      await tx.paymentMilestone.create({
        data: {
          bookingId: booking.id,
          kind: 'PAYMENT',
          label: 'Full payment',
          amountMinor: totalMinor,
          currency: event.currency,
          dueAt: new Date(),
          releaseRule: 'ON_PAYMENT',
        },
      });
      try {
        await tx.availabilityBlock.create({
          data: {
            orgId: input.vendorOrgId,
            spaceId: input.spaceId ?? null,
            date,
            slot: input.slot,
            bookingId: booking.id,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('That date was just booked', { key: 'slotTaken' });
        }
        throw error;
      }
      await audit(tx, {
        actor,
        action: 'booking.instant',
        targetType: 'Booking',
        targetId: booking.id,
        data: { eventId: input.eventId, vendorOrgId: input.vendorOrgId },
      });
      await enqueue(tx, 'booking.created', {
        bookingId: booking.id,
        eventId: input.eventId,
        vendorOrgId: input.vendorOrgId,
        paymentMode: input.paymentMode,
      });
      return { bookingId: booking.id };
    })
    .then(async (result) => {
      try {
        const threadId = await ensureBookingThread(result.bookingId);
        await postCard(actor, {
          threadId,
          type: 'booking',
          refId: result.bookingId,
          snapshot: {
            category: 'venue',
            totalMinor: totalMinor.toString(),
            currency: event.currency,
          },
        });
        await mirrorToEventTeam(actor, input.eventId, 'booking', result.bookingId);
      } catch (error) {
        log.warn(
          { err: error instanceof Error ? error.message : String(error), bookingId: result.bookingId },
          'booking cards failed',
        );
      }
      return result;
    });
}

/** Deposit holds past their deadline: CANCELLED, and the date is freed. */
export async function expireHolds(now = new Date()) {
  const due = await prisma.booking.findMany({
    where: { status: 'DEPOSIT_DUE', holdExpiresAt: { lt: now } },
    select: { id: true, eventId: true, vendorOrgId: true },
  });
  let expired = 0;
  for (const booking of due) {
    const updated = await prisma.booking.updateMany({
      where: { id: booking.id, status: 'DEPOSIT_DUE' },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    if (updated.count === 0) continue;
    await prisma.availabilityBlock.deleteMany({ where: { bookingId: booking.id } });
    expired += 1;
    await audit(prisma, {
      actor: { kind: 'system' },
      action: 'booking.holdExpired',
      targetType: 'Booking',
      targetId: booking.id,
      data: { eventId: booking.eventId, vendorOrgId: booking.vendorOrgId },
    });
    await enqueue(prisma, 'booking.hold_expired', {
      bookingId: booking.id,
      eventId: booking.eventId,
      vendorOrgId: booking.vendorOrgId,
    });
  }
  return { expired };
}
