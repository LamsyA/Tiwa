import type { MilestoneState } from '@tiwa/db';

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
