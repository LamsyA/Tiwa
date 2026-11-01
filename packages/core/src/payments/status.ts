import { prisma, type MilestoneState } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { ForbiddenError } from '../shared/errors.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

export const vendorBookingsSchema = z.object({ vendorOrgId: z.string().uuid() });

// Payment status per booking (P8-T16, lean D-X27): read from milestone
// states until the ledger exists. "Secured" is money the vendor has (or
// Tiwa holds for them); "awaiting" is recorded offline but not yet
// confirmed; "outstanding" is everything still to pay.

const SECURED: MilestoneState[] = ['PAID_DIRECT', 'HELD', 'RELEASED', 'CONFIRMED_OFFLINE'];
const AWAITING: MilestoneState[] = ['RECORDED_OFFLINE', 'PENDING_PAYMENT'];
const VOID: MilestoneState[] = ['REFUNDED'];

export interface BookingMoney {
  totalMinor: bigint;
  securedMinor: bigint;
  awaitingMinor: bigint;
  outstandingMinor: bigint;
}

export function bookingMoney(milestones: { state: MilestoneState; amountMinor: bigint | string }[]): BookingMoney {
  const money: BookingMoney = { totalMinor: 0n, securedMinor: 0n, awaitingMinor: 0n, outstandingMinor: 0n };
  for (const row of milestones) {
    if (VOID.includes(row.state)) continue;
    const amount = BigInt(row.amountMinor);
    money.totalMinor += amount;
    if (SECURED.includes(row.state)) money.securedMinor += amount;
    else if (AWAITING.includes(row.state)) money.awaitingMinor += amount;
    else money.outstandingMinor += amount;
  }
  return money;
}

/** Vendor's bookings with payment status (P8-T16): newest first, money from milestone states. */
export async function listVendorBookingMoney(actor: UserActor, raw: z.input<typeof vendorBookingsSchema>) {
  const { vendorOrgId } = vendorBookingsSchema.parse(raw);
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: vendorOrgId },
    select: { role: true },
  });
  if (!membership) throw new ForbiddenError('Only the vendor team lists bookings');
  const bookings = await prisma.booking.findMany({
    where: { vendorOrgId, status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      currency: true,
      event: { select: { name: true, startsAt: true } },
      milestones: { select: { state: true, amountMinor: true } },
    },
  });
  return bookings.map(({ milestones, event, ...row }) => {
    const money = bookingMoney(milestones);
    return {
      ...row,
      eventName: event.name,
      startsAt: event.startsAt?.toISOString() ?? null,
      securedMinor: money.securedMinor.toString(),
      awaitingMinor: money.awaitingMinor.toString(),
      outstandingMinor: money.outstandingMinor.toString(),
    };
  });
}
