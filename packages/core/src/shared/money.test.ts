import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors.js';
import { add, allocate, equals, money, mulBps, sub, zero } from './money.js';

const arbMoney = (currency = 'NGN') =>
  fc.bigInt({ min: -1_000_000_000_000n, max: 1_000_000_000_000n }).map((amount) => money(amount, currency));

describe('add/sub', () => {
  it('add then sub round-trips', () => {
    fc.assert(
      fc.property(arbMoney(), arbMoney(), (a, b) => {
        expect(equals(sub(add(a, b), b), a)).toBe(true);
      }),
    );
  });

  it('add is commutative', () => {
    fc.assert(
      fc.property(arbMoney(), arbMoney(), (a, b) => {
        expect(equals(add(a, b), add(b, a))).toBe(true);
      }),
    );
  });

  it('rejects mixed currencies', () => {
    expect(() => add(money(100n, 'NGN'), money(100n, 'USD'))).toThrow(ValidationError);
    expect(() => sub(money(100n, 'NGN'), money(100n, 'USD'))).toThrow(ValidationError);
  });

  it('rejects bad currency codes and fractional numbers', () => {
    expect(() => money(100n, 'ngn')).toThrow(ValidationError);
    expect(() => money(100n, 'NIGERIA')).toThrow(ValidationError);
    expect(() => money(10.5, 'NGN')).toThrow(RangeError);
    expect(zero('NGN')).toEqual({ amount: 0n, currency: 'NGN' });
  });
});

describe('mulBps', () => {
  it('10000 bps is the identity, 0 bps is zero', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -1_000_000_000_000n, max: 1_000_000_000_000n }), (amount) => {
        expect(mulBps(amount, 10_000)).toBe(amount);
        expect(mulBps(amount, 0)).toBe(0n);
      }),
    );
  });

  it('never exceeds the principal for bps <= 10000 and truncates toward zero', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000_000n }),
        fc.integer({ min: 0, max: 10_000 }),
        (amount, bps) => {
          const fee = mulBps(amount, bps);
          expect(fee >= 0n && fee <= amount).toBe(true);
          expect(amount * BigInt(bps) - fee * 10_000n < 10_000n).toBe(true);
        },
      ),
    );
  });

  it('rejects negative or fractional bps', () => {
    expect(() => mulBps(100n, -1)).toThrow(ValidationError);
    expect(() => mulBps(100n, 1.5)).toThrow(ValidationError);
  });
});

describe('allocate', () => {
  const arbWeights = () =>
    fc
      .array(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 8 })
      .filter((weights) => weights.some((weight) => weight > 0));

  it('parts always sum exactly to the total (P0 gate)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1_000_000_000_000n }), arbWeights(), (total, weights) => {
        const parts = allocate(total, weights);
        expect(parts).toHaveLength(weights.length);
        expect(parts.reduce((sum, part) => sum + part, 0n)).toBe(total);
        expect(parts.every((part) => part >= 0n)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it('is deterministic and each part is floor or ceil of its exact share', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1_000_000_000n }), arbWeights(), (total, weights) => {
        const first = allocate(total, weights);
        expect(allocate(total, weights)).toEqual(first);
        const weightTotal = BigInt(weights.reduce((sum, weight) => sum + weight, 0));
        first.forEach((part, index) => {
          const exact = (total * BigInt(weights[index] ?? 0)) / weightTotal;
          expect(part === exact || part === exact + 1n).toBe(true);
        });
      }),
    );
  });

  it('splits 100 kobo across 3 evenly as [34, 33, 33]', () => {
    expect(allocate(100n, [1, 1, 1])).toEqual([34n, 33n, 33n]);
  });

  it('gives everything to the only positive weight', () => {
    expect(allocate(100n, [0, 5, 0])).toEqual([0n, 100n, 0n]);
  });

  it('rejects negative totals, empty or all-zero or fractional weights', () => {
    expect(() => allocate(-1n, [1])).toThrow(ValidationError);
    expect(() => allocate(100n, [])).toThrow(ValidationError);
    expect(() => allocate(100n, [0, 0])).toThrow(ValidationError);
    expect(() => allocate(100n, [1.5])).toThrow(ValidationError);
  });
});
