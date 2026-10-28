// Shared PII scrubbing for Sentry `beforeSend` (web + worker) and anywhere
// else error payloads leave the process. Fail toward privacy: digit runs
// that could be phone numbers are redacted even if they might be order ids.
// Never put names, phones, emails or addresses into `details` (errors.ts) —
// this is the last line of defence, not the first.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\+?\d[\d\s\-().]{6,}\d/g;

const SENSITIVE_KEY_RE = /password|passwd|secret|token|api[_-]?key|auth|cookie|session|ssn|card|cvv|pin/i;

export function scrubString(value: string): string {
  return value.replace(EMAIL_RE, '[redacted-email]').replace(PHONE_RE, '[redacted-phone]');
}

function scrubUrl(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? scrubString(url) : `${scrubString(url.slice(0, queryIndex))}?[redacted-query]`;
}

/** Deep-redact unknown JSON-ish data. Returns a new structure (max depth 20). */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 20) return '[redacted-depth]';
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'url' && typeof entry === 'string') {
        output[key] = scrubUrl(entry);
      } else if (key === 'user' && entry !== null && typeof entry === 'object') {
        const { id } = entry as { id?: unknown };
        output[key] = typeof id === 'string' || typeof id === 'number' ? { id } : '[redacted-user]';
      } else if (SENSITIVE_KEY_RE.test(key)) {
        output[key] = '[redacted]';
      } else {
        output[key] = scrubValue(entry, depth + 1);
      }
    }
    return output;
  }
  return value;
}

/**
 * Sentry `beforeSend` — pass the event through and return the scrubbed copy.
 * Typed loosely on purpose: @tiwa/core must not depend on @sentry/*.
 */
export function scrubSentryEvent<T>(event: T): T {
  return scrubValue(event) as T;
}
