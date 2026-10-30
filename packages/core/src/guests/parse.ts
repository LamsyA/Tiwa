import { findPhoneNumbersInText, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

// Paste-a-list parsing (UF-06 step 2): one guest per line, "Name, phone,
// email" in any order. Detection is authoritative here (server); the client
// shows a preview by calling the parse action — no parser duplication, no
// libphonenumber in the client bundle.

export interface ParsedGuestRow {
  name: string;
  phone: string | null;
  phoneInvalid: boolean;
  email: string | null;
  emailInvalid: boolean;
  /** The original line, for showing fixes in the preview. */
  raw: string;
}

const EMAIL_RE = /[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+/;

function validEmail(candidate: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate.trim().toLowerCase());
}

/**
 * Parse pasted lines into guest rows. Phones are normalised to E.164 against
 * the event country; unparseable contacts are flagged (never dropped — the
 * row can still import without them, UF-06 edge cases).
 */
export function parseGuestPaste(text: string, country: string): ParsedGuestRow[] {
  const countryCode = country.toUpperCase() as CountryCode;
  const rows: ParsedGuestRow[] = [];
  for (const line of text.split('\n')) {
    const raw = line.trim();
    if (!raw) continue;
    let rest = raw;
    let email: string | null = null;
    let emailInvalid = false;
    let phone: string | null = null;
    let phoneInvalid = false;

    const emailMatch = rest.match(EMAIL_RE);
    if (emailMatch) {
      const candidate = emailMatch[0];
      if (validEmail(candidate)) email = candidate.trim().toLowerCase();
      else emailInvalid = true;
      rest = rest.replace(candidate, ' ');
    }

    const found = findPhoneNumbersInText(rest, countryCode);
    if (found.length > 0) {
      const candidate = found[0]?.number;
      if (candidate?.isValid()) phone = candidate.number;
      else phoneInvalid = true;
      rest = rest.replace(found[0]?.startsAt !== undefined ? rest.slice(found[0].startsAt, found[0].endsAt) : '', ' ');
    }
    // Any remaining digit run is a phone attempt, not part of a name: strip
    // it and flag the row so the preview can highlight the fix (UF-06 edge).
    const leftover = rest.match(/[\d][\d\s().-]{2,}/);
    if (!phone && leftover) {
      const parsed = parsePhoneNumberFromString(leftover[0], countryCode);
      if (parsed?.isValid()) phone = parsed.number;
      else phoneInvalid = true;
      rest = rest.replace(leftover[0], ' ');
    }

    const name = rest
      .split(/[,;|\t]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    rows.push({ name, phone, phoneInvalid, email, emailInvalid, raw });
  }
  return rows;
}
