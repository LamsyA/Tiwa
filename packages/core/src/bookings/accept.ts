import { isDateExclusive } from '@tiwa/config';
import { prisma, Prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize, type Actor } from '../auth/authorize.js';
import { loadEventAccess } from '../events/access.js';
import { isEnabled } from '../flags/flags.js';
import { ConflictError, FeatureDisabledError, NotFoundError, ValidationError } from '../shared/errors.js';
import { mulBps } from '../shared/money.js';
import { audit, enqueue } from '../shared/outbox.js';
import { checkVenueAvailability } from './venue.js';
import { ensureBookingThread, mirrorToEventTeam, postCard } from '../chat/cards.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('bookings');

// Accepting a quote (QTE-05, UF-16): host-side, approval-capped, creates
// Booking v1 (ACCEPTED) + PaymentMilestones from the vendor's proposed
// schedule in one transaction. Records who accepted, when, and from which
// IP (UF-16-1). HELD mode needs the payments.held flag (UF-16-3).

type UserActor = Extract<Actor, { kind: 'user' }>;

export const acceptQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  paymentMode: z.enum(['DIRECT', 'HELD', 'OFFLINE']),
  declineOthers: z.boolean().default(false),
});

interface ScheduleEntry {
  label: string;
  percentBps?: number;
  amountMinor?: string;
  due: string;
}

function milestoneAmount(total: bigint, entry: ScheduleEntry): bigint {
  if (entry.amountMinor !== undefined) return BigInt(entry.amountMinor);
  return mulBps(total, entry.percentBps ?? 0);
}

function milestoneDueAt(due: string, eventStartsAt: Date | null, now: Date): Date | null {
  if (due === 'on_accept') return now;
  const daysBefore = /^days_before:(\d+)$/.exec(due);
  if (daysBefore && eventStartsAt) {
    return new Date(eventStartsAt.getTime() - Number(daysBefore[1]) * 86_400_000);
  }
  const onDate = /^date:(\d{4}-\d{2}-\d{2})$/.exec(due);
  if (onDate) return new Date(`${onDate[1]}T00:00:00.000Z`);
  return eventStartsAt ?? now;
}

export async function acceptQuote(actor: UserActor, raw: z.input<typeof acceptQuoteSchema>, opts?: { ip?: string }) {
  const input = acceptQuoteSchema.parse(raw);
  const quote = await prisma.quote.findUnique({ where: { id: input.quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  const access = await loadEventAccess(actor.userId, quote.eventId);
  if (!access) throw new NotFoundError('Quote not found');
  if (access.role === 'VENDOR' || access.role === 'PHOTOGRAPHER') throw new NotFoundError('Quote not found');
  // Approval caps (UF-04-2, UF-16-2): a finance co-host can only accept within their limit.
  authorize(actor, 'quote.accept', { eventId: quote.eventId, access, amountMinor: quote.totalMinor });

  if (quote.status === 'EXPIRED' || quote.expiresAt <= new Date()) {
    if (quote.status !== 'EXPIRED') {
      await prisma.quote.update({ where: { id: quote.id }, data: { status: 'EXPIRED' } });
    }
    throw new ValidationError('This quote has expired', { key: 'quoteExpired' });
  }
  if (quote.status !== 'SENT') throw new ValidationError('Only a sent quote can be accepted', { key: 'quoteNotSent' });

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: quote.eventId },
    select: { countryCode: true, startsAt: true, currency: true, timezone: true },
  });
  if (quote.currency !== event.currency) {
    throw new ValidationError('Quote currency does not match the event', { key: 'currencyMismatch' });
  }
  if (input.paymentMode === 'HELD' && !(await isEnabled('payments.held', event.countryCode))) {
    throw new FeatureDisabledError(undefined, { flag: 'payments.held' });
  }

  const schedule = quote.proposedSchedule as unknown as ScheduleEntry[];
  if (!Array.isArray(schedule) || schedule.length === 0) {
    throw new ValidationError('Quote has no payment schedule', { key: 'scheduleRequired' });
  }

  const now = new Date();
  const amounts = schedule.map((entry) => milestoneAmount(quote.totalMinor, entry));
  const sum = amounts.reduce((total, amount) => total + amount, 0n);
  if (sum !== quote.totalMinor) {
    // Keep milestones honest: the last one absorbs rounding or vendor error.
    amounts[amounts.length - 1] = (amounts[amounts.length - 1] ?? 0n) + (quote.totalMinor - sum);
  }

  let category = 'other';
  if (quote.requestId) {
    const request = await prisma.quoteRequest.findUnique({
      where: { id: quote.requestId },
      select: { category: true },
    });
    if (request) category = request.category;
  } else {
    const profile = await prisma.businessProfile.findUnique({
      where: { orgId: quote.vendorOrgId },
      select: { categories: true },
    });
    if (profile?.categories[0]) category = profile.categories[0];
  }

  // A deposit (anything not fully due on accept) holds the date: the booking
  // starts DEPOSIT_DUE with a countdown; otherwise it is ACCEPTED outright.
  const first = schedule[0]!;
  const depositDue = schedule.length > 1 || first.due !== 'on_accept' || (amounts[0] ?? 0n) < quote.totalMinor;
  const profile = await prisma.businessProfile.findUnique({
    where: { orgId: quote.vendorOrgId },
    select: { holdHours: true },
  });
  // The day this vendor works (D-X43): the quote's date, else the event's
  // start date in the event's own time zone.
  const serviceDate =
    quote.serviceDate ??
    (event.startsAt
      ? new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: event.timezone }).format(event.startsAt)}T00:00:00Z`)
      : null);
  const blocksDate = serviceDate !== null && (quote.spaceId !== null || isDateExclusive(category));

  return prisma
    .$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          eventId: quote.eventId,
          vendorOrgId: quote.vendorOrgId,
          quoteId: quote.id,
          category,
          spaceId: quote.spaceId,
          serviceDate,
          slot: quote.slot,
          status: depositDue ? 'DEPOSIT_DUE' : 'ACCEPTED',
          paymentMode: input.paymentMode,
          holdExpiresAt: depositDue ? new Date(now.getTime() + (profile?.holdHours ?? 72) * 3_600_000) : null,
          totalMinor: quote.totalMinor,
          currency: quote.currency,
        },
        select: { id: true },
      });
      await tx.bookingVersion.create({
        data: {
          bookingId: booking.id,
          version: 1,
          status: 'ACCEPTED',
          scope: {
            items: quote.items,
            notes: quote.notes,
            schedule: quote.proposedSchedule,
            spaceId: quote.spaceId,
            serviceDate: quote.serviceDate?.toISOString() ?? null,
            slot: quote.slot,
            quoteId: quote.id,
            taxBps: quote.taxBps,
            serviceBps: quote.serviceBps,
            travelFeeMinor: quote.travelFeeMinor.toString(),
          },
          totalMinor: quote.totalMinor,
          terms: quote.cancellationTerms,
          proposedById: actor.userId,
          decidedAt: now,
          acceptedByHostId: actor.userId,
          acceptedByHostAt: now,
          acceptedByHostIp: opts?.ip ?? null,
        },
      });
      for (let i = 0; i < schedule.length; i += 1) {
        const entry = schedule[i]!;
        await tx.paymentMilestone.create({
          data: {
            bookingId: booking.id,
            kind: 'PAYMENT',
            label: entry.label,
            amountMinor: amounts[i] ?? 0n,
            currency: quote.currency,
            dueAt: milestoneDueAt(entry.due, event.startsAt, now),
            releaseRule: 'ON_PAYMENT',
          },
        });
      }
      await tx.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } });
      if (quote.requestId) {
        await tx.quoteRequest.update({ where: { id: quote.requestId }, data: { status: 'CLOSED' } });
      }
      if (blocksDate) {
        // Venues and one-event-a-day services hold the date the moment the
        // quote is accepted (P7-T10, D-X43); a clash refuses the booking.
        const slot = quote.slot ?? 'FULL_DAY';
        await checkVenueAvailability(tx, {
          vendorOrgId: quote.vendorOrgId,
          spaceId: quote.spaceId,
          date: serviceDate,
          slot,
        });
        try {
          await tx.availabilityBlock.create({
            data: {
              orgId: quote.vendorOrgId,
              spaceId: quote.spaceId,
              date: serviceDate,
              slot,
              bookingId: booking.id,
            },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictError('That date was just booked', { key: 'slotTaken' });
          }
          throw error;
        }
      }
      if (input.declineOthers) {
        // UF-16: only quotes in the same category are declined, never the whole event.
        const others = await tx.quote.findMany({
          where: {
            eventId: quote.eventId,
            id: { not: quote.id },
            status: { in: ['SENT', 'CHANGES_REQUESTED'] },
          },
          select: { id: true, requestId: true, vendorOrgId: true },
        });
        const toDecline: string[] = [];
        for (const other of others) {
          let otherCategory: string | null = null;
          if (other.requestId) {
            const peer = await tx.quoteRequest.findUnique({
              where: { id: other.requestId },
              select: { category: true },
            });
            otherCategory = peer?.category ?? null;
          }
          if (!otherCategory) {
            const peerProfile = await tx.businessProfile.findUnique({
              where: { orgId: other.vendorOrgId },
              select: { categories: true },
            });
            otherCategory = peerProfile?.categories[0] ?? null;
          }
          if (otherCategory === category) toDecline.push(other.id);
        }
        if (toDecline.length > 0) {
          await tx.quote.updateMany({ where: { id: { in: toDecline } }, data: { status: 'DECLINED' } });
        }
      }
      await audit(tx, {
        actor,
        action: 'booking.accept',
        targetType: 'Booking',
        targetId: booking.id,
        data: { eventId: quote.eventId, quoteId: quote.id, paymentMode: input.paymentMode },
        ...(opts?.ip ? { ip: opts.ip } : {}),
      });
      await enqueue(tx, 'booking.created', {
        bookingId: booking.id,
        eventId: quote.eventId,
        vendorOrgId: quote.vendorOrgId,
        paymentMode: input.paymentMode,
      });
      return { bookingId: booking.id, status: depositDue ? ('DEPOSIT_DUE' as const) : ('ACCEPTED' as const) };
    })
    .then(async (result) => {
      // Chat cards (P7-T12): best-effort — a card failure must never undo the booking.
      try {
        const [vendor, booking] = await Promise.all([
          prisma.organization.findUnique({ where: { id: quote.vendorOrgId }, select: { name: true } }),
          prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId }, select: { category: true } }),
        ]);
        const threadId = await ensureBookingThread(result.bookingId);
        await postCard(actor, {
          threadId,
          type: 'quote',
          refId: quote.id,
          snapshot: {
            vendorName: vendor?.name ?? '',
            totalMinor: quote.totalMinor.toString(),
            currency: quote.currency,
          },
        });
        await postCard(actor, {
          threadId,
          type: 'booking',
          refId: result.bookingId,
          snapshot: {
            category: booking.category,
            totalMinor: quote.totalMinor.toString(),
            currency: quote.currency,
          },
        });
        await mirrorToEventTeam(actor, quote.eventId, 'booking', result.bookingId);
      } catch (error) {
        log.warn(
          { err: error instanceof Error ? error.message : String(error), bookingId: result.bookingId },
          'booking cards failed',
        );
      }
      return result;
    });
}
