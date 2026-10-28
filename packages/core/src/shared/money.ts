import type { ErrorCode } from './errors.js';
import { ValidationError } from './errors.js';

/** Money in minor units (kobo, cents…) with an ISO 4217 currency code. Never floats. */
export interface Money {
  readonly amount: bigint;
  readonly currency: string;
}

const CURRENCY_RE = /^[A-Z]{3}$/;

/** Construct validated money. Rejects non-integer amounts and bad codes. */
export function money(amount: bigint | number | string, currency: string): Money {
  const value = typeof amount === 'bigint' ? amount : BigInt(amount);
  if (!CURRENCY_RE.test(currency)) {
    throw new ValidationError(`Invalid currency code: ${currency}`, { currency });
  }
  return { amount: value, currency };
}

/** Zero in the given currency. */
export function zero(currency: string): Money {
  return money(0n, currency);
}

function assertSameCurrency(a: Money, b: Money, op: string): void {
  if (a.currency !== b.currency) {
    throw new ValidationError(`Cannot ${op} ${a.currency} and ${b.currency}`, {
      code: 'CURRENCY_MISMATCH' as ErrorCode,
      left: a.currency,
      right: b.currency,
    });
  }
}

/** Add two same-currency amounts. */
export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b, 'add');
  return { amount: a.amount + b.amount, currency: a.currency };
}

/** Subtract (result may be negative — e.g. over-budget outstanding). */
export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b, 'subtract');
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

/**
 * Multiply minor units by basis points (1/100 of 1%).
 * Truncates toward zero; fees therefore never over-charge by a fraction.
 * (Half-up rounding can replace this in P8 if product requires it.)
 */
export function mulBps(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new ValidationError(`bps must be a non-negative integer, got ${bps}`, { bps });
  }
  return (amount * BigInt(bps)) / 10_000n;
}

export function isNonNegativeIntegerWeight(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Split `total` across integer `weights` (e.g. percentages, bps, share counts).
 * Uses the largest-remainder method: every part is floor or ceil of its exact
 * share, the remainder goes to the largest fractional parts (ties → lowest
 * index, so results are deterministic), and the parts always sum to `total`.
 */
export function allocate(total: bigint, weights: number[]): bigint[] {
  if (total < 0n) {
    throw new ValidationError(`allocate requires a non-negative total, got ${total}`, { total: String(total) });
  }
  if (weights.length === 0) {
    throw new ValidationError('allocate requires at least one weight', {});
  }
  if (!weights.every(isNonNegativeIntegerWeight)) {
    throw new ValidationError('allocate weights must be non-negative integers', { weights });
  }
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal === 0) {
    throw new ValidationError('allocate requires at least one positive weight', { weights });
  }

  const totalWeight = BigInt(weightTotal);
  const floors: bigint[] = [];
  const remainders: bigint[] = [];
  let assigned = 0n;
  for (const weight of weights) {
    const numerator = total * BigInt(weight);
    const floor = numerator / totalWeight;
    floors.push(floor);
    remainders.push(numerator % totalWeight);
    assigned += floor;
  }

  let leftover = total - assigned;
  const order = remainders
    .map((remainder, index) => ({ remainder, index: index as number }))
    .sort((a, b) => (b.remainder === a.remainder ? a.index - b.index : b.remainder > a.remainder ? 1 : -1));
  const parts = [...floors];
  for (const { index } of order) {
    if (leftover === 0n) break;
    parts[index] = (parts[index] ?? 0n) + 1n;
    leftover -= 1n;
  }
  return parts;
}
