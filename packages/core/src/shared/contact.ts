import type { Prisma } from '@tiwa/db';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { ValidationError } from './errors.js';

/** E.164 from any human input; national numbers resolve against `country`. Throws VALIDATION. */
export function toE164(raw: string, country: string): string {
  const parsed = parsePhoneNumberFromString(raw.trim(), country.toUpperCase() as CountryCode);
  if (!parsed?.isValid()) throw new ValidationError('Invalid phone number', { field: 'phone', key: 'invalidPhone' });
  return parsed.number;
}

export function normaliseEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new ValidationError('Invalid email', { field: 'email', key: 'invalidEmail' });
  return email;
}

/**
 * The account behind an invited phone or email: the existing one, or a
 * placeholder carrying only that contact (D-X07). The person signs in to it
 * with OTP or a magic link. Closed accounts can't be invited.
 */
export async function findOrCreateContactUser(
  tx: Prisma.TransactionClient,
  contact: { phone?: string | undefined; email?: string | undefined },
  countryCode: string,
): Promise<{ userId: string; created: boolean }> {
  const where = contact.phone ? { phone: contact.phone } : { email: contact.email as string };
  const existing = await tx.user.findFirst({ where, select: { id: true, deletedAt: true } });
  if (existing?.deletedAt) throw new ValidationError('Account closed', { reason: 'account-deleted' });
  if (existing) return { userId: existing.id, created: false };
  const user = await tx.user.create({
    data: contact.phone
      ? { name: '', phone: contact.phone, phoneNumber: contact.phone, countryCode }
      : { name: '', email: contact.email as string, countryCode },
    select: { id: true },
  });
  return { userId: user.id, created: true };
}
