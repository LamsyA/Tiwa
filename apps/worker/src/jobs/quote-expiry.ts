import { createLogger, expireHolds, expireQuotes } from '@tiwa/core';

type Log = ReturnType<typeof createLogger>;

/** Backend.md §5.2 `quotes/expire` (hourly): past-expiry quotes in a live state become EXPIRED. */
export const QUOTE_EXPIRY_JOB = 'quotes/expire' as const;
export const QUOTE_EXPIRY_EVERY_MS = 60 * 60 * 1000;

export async function handleQuoteExpiry(log: Log, now = new Date()): Promise<{ expired: number }> {
  const result = await expireQuotes(now);
  if (result.expired > 0) log.info({ topic: QUOTE_EXPIRY_JOB, expired: result.expired }, 'quotes expired');
  return result;
}

/** P7-T10 `bookings/expire-holds` (hourly): unpaid deposit holds free their dates. */
export const HOLD_EXPIRY_JOB = 'bookings/expire-holds' as const;
export const HOLD_EXPIRY_EVERY_MS = 60 * 60 * 1000;

export async function handleHoldExpiry(log: Log, now = new Date()): Promise<{ expired: number }> {
  const result = await expireHolds(now);
  if (result.expired > 0) log.info({ topic: HOLD_EXPIRY_JOB, expired: result.expired }, 'holds expired');
  return result;
}
