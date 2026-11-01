import type { MilestoneState } from '@tiwa/db';

// Budget alerts (P9-T05, BUD-07; D-X28): computed on read and shown on the
// money page and the overview. Sending them as notifications waits for P13
// and the worker. Overdue payments count as "due within a day".

const DAY = 86_400_000;
const SETTLED: MilestoneState[] = [
  'PAID_DIRECT',
  'HELD',
  'RELEASED',
  'CONFIRMED_OFFLINE',
  'RECORDED_OFFLINE',
  'REFUNDED',
];

export type BudgetAlert =
  | { kind: 'over_budget'; key: string | null; label: string | null; overMinor: bigint }
  | {
      kind: 'payment_due';
      within: '1d' | '7d';
      milestoneId: string;
      bookingId: string;
      label: string;
      vendorName: string;
      /** Null when the planner hides vendor prices from the host (EVT-12). */
      amountMinor: bigint | null;
      dueAt: Date;
    };

export interface AlertSummaryInput {
  totals: { uncommittedMinor: bigint };
  lines: { key: string; label: string | null; plannedMinor: bigint; uncommittedMinor: bigint }[];
}

export interface AlertScheduleRow {
  id: string;
  bookingId: string;
  label: string;
  vendorName: string;
  amountMinor: bigint | string | null;
  dueAt: Date | string | null;
  state: MilestoneState;
}

export function budgetAlerts(
  summary: AlertSummaryInput,
  schedule: AlertScheduleRow[],
  now: Date = new Date(),
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  if (summary.totals.uncommittedMinor < 0n) {
    alerts.push({ kind: 'over_budget', key: null, label: null, overMinor: -summary.totals.uncommittedMinor });
  }
  for (const line of summary.lines) {
    if (line.plannedMinor > 0n && line.uncommittedMinor < 0n) {
      alerts.push({ kind: 'over_budget', key: line.key, label: line.label, overMinor: -line.uncommittedMinor });
    }
  }
  for (const row of schedule) {
    if (!row.dueAt || SETTLED.includes(row.state)) continue;
    const dueAt = new Date(row.dueAt);
    const left = dueAt.getTime() - now.getTime();
    if (left > 7 * DAY) continue;
    alerts.push({
      kind: 'payment_due',
      within: left <= DAY ? '1d' : '7d',
      milestoneId: row.id,
      bookingId: row.bookingId,
      label: row.label,
      vendorName: row.vendorName,
      amountMinor: row.amountMinor == null ? null : BigInt(row.amountMinor),
      dueAt,
    });
  }
  return alerts;
}
