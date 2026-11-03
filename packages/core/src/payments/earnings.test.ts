// D-X46: vendor earnings split into this month, upcoming and overdue, per currency.
import { describe, expect, it } from 'vitest';
import { summariseEarnings, type EarningsRow } from './earnings.js';

const now = new Date('2026-11-15T12:00:00Z');
const row = (over: Partial<EarningsRow>): EarningsRow => ({
  state: 'SCHEDULED',
  amountMinor: 100_00n,
  currency: 'NGN',
  dueAt: null,
  paidAt: null,
  ...over,
});

describe('summariseEarnings (D-X46)', () => {
  it('splits paid, upcoming and overdue, and fills the six-month trend', () => {
    const [ngn] = summariseEarnings(
      [
        row({ state: 'CONFIRMED_OFFLINE', amountMinor: 500_00n, paidAt: new Date('2026-11-02T00:00:00Z') }),
        row({ state: 'PAID_DIRECT', amountMinor: 200_00n, paidAt: new Date('2026-10-20T00:00:00Z') }),
        row({ state: 'SCHEDULED', amountMinor: 300_00n, dueAt: new Date('2026-12-01T00:00:00Z') }),
        row({ state: 'PENDING_PAYMENT', amountMinor: 50_00n, dueAt: new Date('2026-11-01T00:00:00Z') }),
        row({ state: 'REFUNDED', amountMinor: 999_00n, paidAt: new Date('2026-11-03T00:00:00Z') }),
      ],
      now,
    );
    expect(ngn!.thisMonthMinor).toBe(500_00n);
    expect(ngn!.lastMonthMinor).toBe(200_00n);
    expect(ngn!.upcomingMinor).toBe(300_00n);
    expect(ngn!.overdueMinor).toBe(50_00n);
    expect(ngn!.overdueCount).toBe(1);
    expect(ngn!.trend.map((point) => point.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(ngn!.trend.at(-1)!.minor).toBe(500_00n);
  });

  it('never adds two currencies together', () => {
    const summaries = summariseEarnings(
      [row({ currency: 'NGN', amountMinor: 1n }), row({ currency: 'USD', amountMinor: 2n })],
      now,
    );
    expect(summaries.map((summary) => summary.currency).sort()).toEqual(['NGN', 'USD']);
  });
});
