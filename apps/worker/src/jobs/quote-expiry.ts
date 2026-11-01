import { createLogger, expireQuotes } from '@tiwa/core';

type Log = ReturnType<typeof createLogger>;

/** Backend.md §5.2 `quotes/expire` (hourly): past-expiry quotes in a live state become EXPIRED. */
export const QUOTE_EXPIRY_JOB = 'quotes/expire' as const;
export const QUOTE_EXPIRY_EVERY_MS = 60 * 60 * 1000;

export async function handleQuoteExpiry(log: Log, now = new Date()): Promise<{ expired: number }> {
  const result = await expireQuotes(now);
  if (result.expired > 0) log.info({ topic: QUOTE_EXPIRY_JOB, expired: result.expired }, 'quotes expired');
  return result;
}
