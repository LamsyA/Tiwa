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
