import { prisma, type MilestoneState } from '@tiwa/db';
import type { Actor } from '../auth/authorize.js';
import { ForbiddenError } from '../shared/errors.js';

// Vendor earnings summary (D-X46): this month, upcoming, overdue and a
// six-month trend, read from milestone states like `bookingMoney` (the
// ledger replaces this when payouts arrive). One summary per currency so a
// vendor paid in two currencies never sees them added together.

type UserActor = Extract<Actor, { kind: 'user' }>;

const SECURED: MilestoneState[] = ['PAID_DIRECT', 'HELD', 'RELEASED', 'CONFIRMED_OFFLINE'];
const OPEN: MilestoneState[] = ['SCHEDULED', 'PENDING_PAYMENT', 'RECORDED_OFFLINE'];

export interface EarningsRow {
  state: MilestoneState;
  amountMinor: bigint;
  currency: string;
  dueAt: Date | null;
  paidAt: Date | null;
}

export interface EarningsSummary {
  currency: string;
  thisMonthMinor: bigint;
  lastMonthMinor: bigint;
  upcomingMinor: bigint;
  upcomingCount: number;
  overdueMinor: bigint;
  overdueCount: number;
  /** Oldest first: `month` is YYYY-MM (UTC). */
  trend: { month: string; minor: bigint }[];
}

const monthOf = (date: Date) => date.toISOString().slice(0, 7);

function monthsBack(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1))),
  );
}

/** Pure summary over milestone rows; exported for tests. */
export function summariseEarnings(rows: EarningsRow[], now: Date): EarningsSummary[] {
  const months = monthsBack(now, 6);
  const thisMonth = months[5]!;
  const lastMonth = months[4]!;
  const byCurrency = new Map<string, EarningsSummary>();
  for (const row of rows) {
    let summary = byCurrency.get(row.currency);
    if (!summary) {
      summary = {
        currency: row.currency,
        thisMonthMinor: 0n,
        lastMonthMinor: 0n,
        upcomingMinor: 0n,
        upcomingCount: 0,
        overdueMinor: 0n,
        overdueCount: 0,
        trend: months.map((month) => ({ month, minor: 0n })),
      };
      byCurrency.set(row.currency, summary);
    }
    if (SECURED.includes(row.state) && row.paidAt) {
      const month = monthOf(row.paidAt);
      if (month === thisMonth) summary.thisMonthMinor += row.amountMinor;
      if (month === lastMonth) summary.lastMonthMinor += row.amountMinor;
      const bar = summary.trend.find((point) => point.month === month);
      if (bar) bar.minor += row.amountMinor;
    } else if (OPEN.includes(row.state)) {
      if (row.dueAt && row.dueAt < now) {
        summary.overdueMinor += row.amountMinor;
        summary.overdueCount += 1;
      } else {
        summary.upcomingMinor += row.amountMinor;
        summary.upcomingCount += 1;
      }
    }
  }
  const weight = (summary: EarningsSummary) => summary.thisMonthMinor + summary.upcomingMinor;
  return [...byCurrency.values()].sort((a, b) => (weight(b) > weight(a) ? 1 : weight(b) < weight(a) ? -1 : 0));
}

/** The vendor team's earnings across every live booking. */
export async function vendorEarnings(actor: UserActor, vendorOrgId: string, now = new Date()) {
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: vendorOrgId },
    select: { role: true },
  });
  if (!membership) throw new ForbiddenError('Only the vendor team sees earnings');
  const rows = await prisma.paymentMilestone.findMany({
    where: { booking: { vendorOrgId, status: { not: 'CANCELLED' } }, kind: 'PAYMENT' },
    select: { state: true, amountMinor: true, currency: true, dueAt: true, paidAt: true, releasedAt: true },
  });
  return summariseEarnings(
    rows.map((row) => ({ ...row, paidAt: row.paidAt ?? row.releasedAt })),
    now,
  );
}
