// Side-effect free on purpose: importing this module must never validate
// the environment (tests, client bundles). Full validation lives in env.ts.

// Minimal launch-country table. Extended per market in P9 (budget) —
// unknown countries fall back to the launch currency, never crash.
const COUNTRY_CURRENCY: Record<string, string> = {
  NG: 'NGN',
  GH: 'GHS',
  KE: 'KES',
  ZA: 'ZAR',
  GB: 'GBP',
  US: 'USD',
};

/** ISO currency for a country code (defaults to the app's launch country). */
export function currencyForCountry(country: string = process.env.DEFAULT_COUNTRY ?? 'NG'): string {
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? 'NGN';
}

/** Narrow currency symbol (e.g. ₦) via Intl — no hardcoded symbols in UI. */
export function currencySymbol(currency: string, locale = 'en'): string {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value ?? currency;
}

const COUNTRY_TIMEZONE: Record<string, string> = {
  NG: 'Africa/Lagos',
  GH: 'Africa/Accra',
  KE: 'Africa/Nairobi',
  ZA: 'Africa/Johannesburg',
  GB: 'Europe/London',
  US: 'America/New_York',
};

/** Default IANA timezone for a country's events (the host can still pick another). */
export function timezoneForCountry(country: string = process.env.DEFAULT_COUNTRY ?? 'NG'): string {
  return COUNTRY_TIMEZONE[country.toUpperCase()] ?? 'Africa/Lagos';
}
