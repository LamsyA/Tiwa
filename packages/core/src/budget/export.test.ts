import { describe, expect, it } from 'vitest';
import { budgetCsv, csvCell, minorToDecimal } from './export.js';
import { computeBudget } from './summary.js';

describe('budget CSV', () => {
  it('formats minor units as decimals', () => {
    expect(minorToDecimal(123456n, 2)).toBe('1234.56');
    expect(minorToDecimal(5n, 2)).toBe('0.05');
    expect(minorToDecimal(-150n, 2)).toBe('-1.50');
    expect(minorToDecimal(900n, 0)).toBe('900');
  });

  it('quotes commas and neutralises formula cells', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5')).toBe("'-5");
  });

  it('writes lines, their bookings and expenses, and income', () => {
    const summary = computeBudget({
      plannedTotalMinor: 100_000n,
      categories: [{ key: 'catering', label: 'Food, drinks', plannedMinor: 100_000n }],
      bookings: [
        {
          id: 'b',
          category: 'catering',
          status: 'CONFIRMED',
          totalMinor: 60_000n,
          vendorName: 'Chef',
          milestones: [{ state: 'CONFIRMED_OFFLINE', amountMinor: 20_000n }],
        },
      ],
      expenses: [{ id: 'e', categoryKey: 'catering', description: 'Ice', amountMinor: 1_000n, paidAt: null }],
      contributions: [{ kind: 'sponsor', pledgedMinor: 50_000n, receivedMinor: 10_000n }],
    });
    const csv = budgetCsv(summary, 'NGN', {
      headers: ['Section', 'Item', 'Planned', 'Committed', 'Paid', 'Outstanding', 'Currency'],
      sections: { line: 'Category', booking: 'Booking', expense: 'Expense', income: 'Income' },
      otherLabel: 'Other',
      incomeKind: (kind) => kind.toUpperCase(),
    });
    expect(csv.split('\r\n')).toEqual([
      'Section,Item,Planned,Committed,Paid,Outstanding,Currency',
      'Category,"Food, drinks",1000.00,610.00,200.00,410.00,NGN',
      'Booking,"Food, drinks: Chef",,600.00,200.00,400.00,NGN',
      'Expense,"Food, drinks: Ice",,10.00,0.00,10.00,NGN',
      'Income,SPONSOR,500.00,,100.00,400.00,NGN',
      '',
    ]);
  });
});
