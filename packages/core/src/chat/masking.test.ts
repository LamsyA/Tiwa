import { describe, expect, it } from 'vitest';
import { MASK, containsLink, scanContactInfo } from './masking.js';

describe('scanContactInfo (Backend.md §9a.3)', () => {
  it.each([
    ['call me on 08031234567', 'call me on ••••'],
    ['my number is +234 803 123 4567 thanks', 'my number is •••• thanks'],
    ['0803-123-4567', '••••'],
    ['email ada@example.com please', 'email •••• please'],
    ['wa.me/2348031234567', '••••'],
    ['join https://chat.whatsapp.com/AbCdEf', 'join ••••'],
    ['instagram.com/bisichops', '••••'],
    ['follow @bisi_chops on IG', 'follow •••• on IG'],
  ])('masks %j', (input, expected) => {
    const scan = scanContactInfo(input, 'NG');
    expect(scan.found).toBe(true);
    expect(scan.masked).toBe(expected);
  });

  it.each([
    'Are you free on 12 Dec for about 150 guests?',
    'Budget is 500,000 for 2 days',
    'The hall fits 300 people, setup at 10:30',
    'Price: 1,250,000 including VAT',
  ])('leaves normal planning messages alone: %j', (input) => {
    expect(scanContactInfo(input, 'NG')).toEqual({ found: false, masked: input });
  });

  it('masks every occurrence and keeps the rest of the message', () => {
    const scan = scanContactInfo('Text 08031234567 or 08097654321, or ada@x.co', 'NG');
    expect(scan.masked).toBe(`Text ${MASK} or ${MASK}, or ${MASK}`);
  });

  it('never masks dates or times, but still masks a phone next to them', () => {
    const date = scanContactInfo('Hi, are you available on 2026-11-03 for about 70 guests?', 'NG');
    expect(date).toEqual({ found: false, masked: 'Hi, are you available on 2026-11-03 for about 70 guests?' });
    expect(scanContactInfo('Party on 03/11/2026 at 14:30, 150 guests', 'NG').found).toBe(false);
    const mixed = scanContactInfo('On 2026-11-03 call 0803 123 4567', 'NG');
    expect(mixed.masked).toBe('On 2026-11-03 call ••••');
    expect(scanContactInfo('0803-123-4567', 'NG').found).toBe(true);
  });

  it('detects links', () => {
    expect(containsLink('see https://example.com/promo')).toBe(true);
    expect(containsLink('see www.example.com')).toBe(true);
    expect(containsLink('no link here')).toBe(false);
  });
});
