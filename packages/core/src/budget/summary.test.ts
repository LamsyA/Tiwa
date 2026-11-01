import type { MilestoneState } from '@tiwa/db';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeBudget, OTHER_KEY, type BudgetInput } from './summary.js';

const STATES: MilestoneState[] = [
  'SCHEDULED',
  'PENDING_PAYMENT',
  'PAID_DIRECT',
  'HELD',
  'RELEASED',
  'REFUNDED',
  'RECORDED_OFFLINE',
  'CONFIRMED_OFFLINE',
];
const CATEGORY_KEYS = ['venue', 'catering', 'decor', 'media', 'misc'];
const BOOKING_CATEGORIES = ['venue', 'catering', 'photography', 'dj', 'cake', 'security'];

const money = fc.bigInt({ min: 0n, max: 10_000_000_000n });

const inputArb: fc.Arbitrary<BudgetInput> = fc.record({
  plannedTotalMinor: money,
  categories: fc
    .subarray(CATEGORY_KEYS, { minLength: 0 })
    .chain((keys) => fc.tuple(...keys.map((key) => money.map((plannedMinor) => ({ key, label: key, plannedMinor })))))
    .map((rows) => [...rows]),
  bookings: fc.array(
    fc.record({
      id: fc.uuid(),
      category: fc.constantFrom(...BOOKING_CATEGORIES),
      status: fc.constantFrom('ACCEPTED', 'DEPOSIT_DUE', 'CONFIRMED', 'CANCELLED', 'COMPLETED'),
      totalMinor: money,
      vendorName: fc.string(),
      milestones: fc.array(fc.record({ state: fc.constantFrom(...STATES), amountMinor: money }), { maxLength: 4 }),
    }),
    { maxLength: 8 },
  ),
  expenses: fc.array(
    fc.record({
      id: fc.uuid(),
      categoryKey: fc.constantFrom(...CATEGORY_KEYS, 'unknown'),
      description: fc.string(),
      amountMinor: money,
      paidAt: fc.option(fc.date(), { nil: null }),
    }),
    { maxLength: 8 },
  ),
  contributions: fc.array(
    fc.record({
      kind: fc.constantFrom('family', 'sponsor', 'other_income'),
      pledgedMinor: money,
      receivedMinor: money,
    }),
    { maxLength: 5 },
  ),
});

describe('computeBudget (UF-20-1, property-based)', () => {
  it('Outstanding = Committed − Paid and Uncommitted = Planned − Committed, totals and per line', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const summary = computeBudget(input);
        for (const row of [summary.totals, ...summary.lines]) {
          expect(row.outstandingMinor).toBe(row.committedMinor - row.paidMinor);
          expect(row.uncommittedMinor).toBe(row.plannedMinor - row.committedMinor);
        }
        const sum = (pick: (line: (typeof summary.lines)[number]) => bigint) =>
          summary.lines.reduce((total, line) => total + pick(line), 0n);
        expect(summary.totals.committedMinor).toBe(sum((line) => line.committedMinor));
        expect(summary.totals.paidMinor).toBe(sum((line) => line.paidMinor));
      }),
      { numRuns: 500 },
    );
  });

  it('committed equals live booking totals plus expenses; cancelled bookings never count', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const summary = computeBudget(input);
        const live = input.bookings.filter((row) => row.status !== 'CANCELLED');
        const expected =
          live.reduce((total, row) => total + row.totalMinor, 0n) +
          input.expenses.reduce((total, row) => total + row.amountMinor, 0n);
        expect(summary.totals.committedMinor).toBe(expected);
      }),
      { numRuns: 300 },
    );
  });
});

describe('computeBudget examples', () => {
  it('counts offline payments only once confirmed and maps vendor categories to budget lines', () => {
    const summary = computeBudget({
      plannedTotalMinor: 1_000_000n,
      categories: [
        { key: 'catering', label: 'Food and drinks', plannedMinor: 600_000n },
        { key: 'media', label: 'Photo and video', plannedMinor: 300_000n },
      ],
      bookings: [
        {
          id: 'b1',
          category: 'cake',
          status: 'CONFIRMED',
          totalMinor: 200_000n,
          vendorName: 'Cakes',
          milestones: [
            { state: 'CONFIRMED_OFFLINE', amountMinor: 50_000n },
            { state: 'RECORDED_OFFLINE', amountMinor: 150_000n },
          ],
        },
        { id: 'b2', category: 'photography', status: 'CANCELLED', totalMinor: 999n, vendorName: 'X', milestones: [] },
        {
          id: 'b3',
          category: 'security',
          status: 'ACCEPTED',
          totalMinor: 70_000n,
          vendorName: 'Guard',
          milestones: [],
        },
      ],
      expenses: [{ id: 'e1', categoryKey: 'media', description: 'Prints', amountMinor: 10_000n, paidAt: new Date() }],
      contributions: [
        { kind: 'family', pledgedMinor: 100n, receivedMinor: 40n },
        { kind: 'family', pledgedMinor: 50n, receivedMinor: 50n },
      ],
    });
    const catering = summary.lines.find((line) => line.key === 'catering')!;
    expect(catering.committedMinor).toBe(200_000n);
    expect(catering.paidMinor).toBe(50_000n);
    expect(summary.lines.find((line) => line.key === 'media')!.committedMinor).toBe(10_000n);
    const other = summary.lines.find((line) => line.key === OTHER_KEY)!;
    expect(other.committedMinor).toBe(70_000n);
    expect(other.plannedMinor).toBe(0n);
    expect(summary.totals).toMatchObject({ plannedMinor: 1_000_000n, committedMinor: 280_000n, paidMinor: 60_000n });
    expect(summary.unallocatedMinor).toBe(100_000n);
    expect(summary.income).toEqual([{ kind: 'family', pledgedMinor: 150n, receivedMinor: 90n }]);
  });
});
