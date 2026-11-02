// Ticket QR tokens (Backend.md §12; P11-T05). Same HMAC pattern as the
// guest pass QR (`checkin:{guestId}:{eventId}:{exp}:{sig}` in guests/rsvp):
// tickets encode `ticket:{ticketId}:{eventId}:{exp}:{sig}` so one scanner
// (P11-T06) verifies either kind without a server round-trip. The value is
// tamper-evidence + expiry, not secrecy — the Ticket row is the source of
// truth and the scanner always confirms against the DB when online.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function signTicket(ticketId: string, eventId: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`ticket-v1:${ticketId}:${eventId}:${exp}`, 'utf8').digest('base64url');
}

export function ticketQrValue(ticketId: string, eventId: string, secret: string, ttlDays = 365): string {
  const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  return `ticket:${ticketId}:${eventId}:${exp}:${signTicket(ticketId, eventId, exp, secret)}`;
}

export function verifyTicketQr(value: string, secret: string): { ticketId: string; eventId: string } | null {
  const parts = value.split(':');
  if (parts.length !== 5 || parts[0] !== 'ticket') return null;
  const [, ticketId, eventId, expRaw, sig] = parts;
  if (!ticketId || !eventId || !expRaw || !sig || !/^\d+$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp <= Date.now()) return null;
  const expected = Buffer.from(signTicket(ticketId, eventId, exp, secret), 'utf8');
  const actual = Buffer.from(sig, 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { ticketId, eventId };
}
