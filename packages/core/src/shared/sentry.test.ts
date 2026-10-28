import { describe, expect, it } from 'vitest';
import { scrubSentryEvent, scrubString, scrubValue } from './sentry.js';

describe('scrubString', () => {
  it('redacts emails and phone-like digit runs, keeps the rest', () => {
    expect(scrubString('contact ada@example.com or +2348012345678 about booking bk_123')).toBe(
      'contact [redacted-email] or [redacted-phone] about booking bk_123',
    );
  });
});

describe('scrubValue', () => {
  it('drops sensitive keys, user PII and query strings', () => {
    const scrubbed = scrubValue({
      message: 'login failed for ada@example.com',
      password: 'hunter2',
      nested: { apiKey: 'abc', amount: 50000 },
      user: { id: 'u_1', email: 'ada@example.com', ip_address: '1.2.3.4' },
      request: { url: 'https://tiwa.app/i/abc123?token=secret-value' },
    }) as Record<string, unknown>;
    expect(scrubbed).toEqual({
      message: 'login failed for [redacted-email]',
      password: '[redacted]',
      nested: { apiKey: '[redacted]', amount: 50000 },
      user: { id: 'u_1' },
      request: { url: 'https://tiwa.app/i/abc123?[redacted-query]' },
    });
  });

  it('handles arrays, nulls and deep nesting without mutating input', () => {
    const input = { tags: ['a', 'b@c.com'], nothing: null, deep: { deep: { phone: '+234 801 234 5678' } } };
    const scrubbed = scrubValue(input) as typeof input;
    expect(scrubbed.tags).toEqual(['a', '[redacted-email]']);
    expect(scrubbed.nothing).toBeNull();
    expect(scrubbed.deep.deep.phone).toBe('[redacted-phone]');
    expect(input.tags?.[1]).toBe('b@c.com');
  });
});

describe('scrubSentryEvent', () => {
  it('returns a scrubbed copy usable as beforeSend', () => {
    const event = { exception: { values: [{ value: 'call +2348012345678' }] } };
    expect(scrubSentryEvent(event)).toEqual({ exception: { values: [{ value: 'call [redacted-phone]' }] } });
  });
});
