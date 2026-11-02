import { createLogger, expireReservations } from '@tiwa/core';

type Log = ReturnType<typeof createLogger>;

/** Backend.md §5.7 `tickets/expire-reservations` (every minute): RESERVED past
 * `reservedUntil` → EXPIRED and the seats are freed (UF-22-2). Idempotent. */
export const TICKET_EXPIRY_JOB = 'tickets/expire-reservations' as const;
export const TICKET_EXPIRY_EVERY_MS = 60_000;

export async function handleTicketExpiry(log: Log, now = new Date()): Promise<{ expired: number }> {
  const result = await expireReservations(now);
  if (result.expired > 0) log.info({ topic: TICKET_EXPIRY_JOB, expired: result.expired }, 'reservations expired');
  return result;
}
