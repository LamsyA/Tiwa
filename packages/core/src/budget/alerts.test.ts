import { describe, expect, it } from 'vitest';
import { budgetAlerts } from './alerts.js';

const now = new Date('2026-11-01T12:00:00Z');
const day = 86_400_000;
const figures = (planned: bigint, committed: bigint) => ({
  plannedMinor: planned,
  committedMinor: committed,
  paidMinor: 0n,
  outstandingMinor: committed,
  uncommittedMinor: planned - committed,
});
const row = (id: string, dueInDays: number | null, state = 'SCHEDULED' as const) => ({
  id,
  bookingId: 'b',
  label: 'Deposit',
  vendorName: 'V',
  amountMinor: '100',
  dueAt: dueInDays === null ? null : new Date(now.getTime() + dueInDays * day),
  state,
});

describe('budgetAlerts', () => {
  it('flags the total and each planned line that goes over budget', () => {
    const alerts = budgetAlerts(
      {
        totals: figures(1000n, 1200n),
        lines: [
          { key: 'venue', label: 'Venue', ...figures(500n, 800n), bookings: [], expenses: [] },
          { key: 'food', label: 'Food', ...figures(500n, 400n), bookings: [], expenses: [] },
          { key: '__other', label: null, ...figures(0n, 0n), bookings: [], expenses: [] },
        ],
      },
      [],
      now,
    );
    expect(alerts).toEqual([
      { kind: 'over_budget', key: null, label: null, overMinor: 200n },
      { kind: 'over_budget', key: 'venue', label: 'Venue', overMinor: 300n },
    ]);
  });

  it('flags unpaid payments due within 7 days and within 1 day (overdue counts as 1 day)', () => {
    const alerts = budgetAlerts(
      { totals: figures(0n, 0n), lines: [] },
      [
        row('soon', 5),
        row('tomorrow', 0.5),
        row('late', -2),
        row('far', 20),
        row('none', null),
        { ...row('paid', 1), state: 'CONFIRMED_OFFLINE' as never },
        { ...row('waiting', 1), state: 'RECORDED_OFFLINE' as never },
      ],
      now,
    );
    expect(alerts.map((a) => (a.kind === 'payment_due' ? `${a.milestoneId}:${a.within}` : a.kind))).toEqual([
      'soon:7d',
      'tomorrow:1d',
      'late:1d',
    ]);
  });
});
