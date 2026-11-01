import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mulBps } from '../shared/money.js';
import { calcQuoteTotals } from './totals.js';

describe('calcQuoteTotals', () => {
  it('adds items, tax, service and travel with integer maths', () => {
    const totals = calcQuoteTotals(
      [
        { name: 'Jollof x100', qty: 100, unitMinor: '150000' },
        { name: 'Service', qty: 1, unitMinor: '5000000' },
      ],
      750,
      500,
      '250000',
    );
    const subtotal = 100n * 150_000n + 5_000_000n;
    expect(totals.subtotalMinor).toBe(subtotal);
    expect(totals.taxMinor).toBe(mulBps(subtotal, 750));
    expect(totals.serviceMinor).toBe(mulBps(subtotal, 500));
    expect(totals.totalMinor).toBe(subtotal + totals.taxMinor + totals.serviceMinor + 250_000n);
  });

  it('zero tax/service/travel equals the subtotal', () => {
    const totals = calcQuoteTotals([{ name: 'Hall', qty: 1, unitMinor: '20000000' }], 0, 0, '0');
    expect(totals.totalMinor).toBe(20_000_000n);
  });

  it('rejects empty items and negative travel', () => {
    expect(() => calcQuoteTotals([], 0, 0, '0')).toThrow();
    expect(() => calcQuoteTotals([{ name: 'X', qty: 1, unitMinor: '100' }], 0, 0, '-5')).toThrow();
  });

  it('property: total always equals subtotal + tax + service + travel', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ qty: fc.integer({ min: 1, max: 100 }), unitMinor: fc.integer({ min: 0, max: 50_000_000 }) }), {
          minLength: 1,
          maxLength: 8,
        }),
        fc.integer({ min: 0, max: 20_000 }),
        fc.integer({ min: 0, max: 20_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (rawItems, taxBps, serviceBps, travel) => {
          const items = rawItems.map((item, i) => ({ name: `item ${i}`, qty: item.qty, unitMinor: String(item.unitMinor) }));
          const totals = calcQuoteTotals(items, taxBps, serviceBps, String(travel));
          const subtotal = items.reduce((sum, item) => sum + BigInt(item.qty) * BigInt(item.unitMinor), 0n);
          expect(totals.subtotalMinor).toBe(subtotal);
          expect(totals.totalMinor).toBe(subtotal + totals.taxMinor + totals.serviceMinor + BigInt(travel));
        },
      ),
      { numRuns: 500 },
    );
  });
});
