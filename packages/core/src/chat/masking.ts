import { findPhoneNumbersInText, type CountryCode } from 'libphonenumber-js';

// Contact details and staying on Tiwa (Backend.md §9a.3). Before a booking is
// confirmed, phone numbers, emails, WhatsApp links and social handles in
// pre-booking threads are hidden from the other side. A nudge, not a wall.

/** Neutral placeholder stored in maskedBody; the UI adds the translated "(shared after booking)" hint. */
export const MASK = '••••';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const WHATSAPP = /\b(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/[^\s]*/gi;
const SOCIAL_LINK =
  /\b(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|facebook\.com|fb\.me|t\.me|telegram\.me|tiktok\.com|x\.com|twitter\.com|snapchat\.com)\/[^\s]*/gi;
/** @handle (not an email local part); 3+ chars like social usernames. */
const HANDLE = /(?<![\w.])@[A-Za-z0-9_.]{3,30}\b/g;
/** Long digit runs, allowing spaces/dots/dashes between digits (e.g. "0803 123 4567", "080-31-23-45-67"). */
const DIGIT_RUN = /(?:\+?\d[\s.\-()]?){7,}\d/g;

/** Dates and clock times look like digit runs but are never contact details (2026-11-03, 03/11/2026, 14:30). */
const DATE_OR_TIME = /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}:\d{2}(?::\d{2})?)\b/g;
const SHIELD = (index: number) => `\uE000${index}\uE000`;
const SHIELDED = /\uE000(\d+)\uE000/g;

export interface ContactScan {
  found: boolean;
  masked: string;
}

/** Find contact details in `text` and return a masked copy. `country` resolves national numbers. */
export function scanContactInfo(text: string, country: string): ContactScan {
  // Hide dates and times from the scanners, then put them back unchanged.
  const kept: string[] = [];
  let masked = text.replace(DATE_OR_TIME, (value) => SHIELD(kept.push(value) - 1));
  let found = false;
  const replace = (pattern: RegExp) => {
    masked = masked.replace(pattern, () => {
      found = true;
      return MASK;
    });
  };
  // Links and emails first, so their digits don't get partially masked as phone numbers.
  replace(WHATSAPP);
  replace(SOCIAL_LINK);
  replace(EMAIL);
  for (const match of findPhoneNumbersInText(masked, country.toUpperCase() as CountryCode).reverse()) {
    masked = `${masked.slice(0, match.startsAt)}${MASK}${masked.slice(match.endsAt)}`;
    found = true;
  }
  replace(DIGIT_RUN);
  replace(HANDLE);
  masked = masked.replace(SHIELDED, (_, index: string) => kept[Number(index)] ?? '');
  return { found, masked };
}

/** Contexts where contact details are hidden until a booking is confirmed (§9a.3). */
export const MASKED_CONTEXTS = new Set(['PROFILE', 'QUOTE_REQUEST', 'QUOTE', 'SITE_VISIT', 'GUEST_ENQUIRY']);

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;
export const containsLink = (text: string) => URL_PATTERN.test(text);
