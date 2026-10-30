import { describe, expect, it } from 'vitest';
import { parseGuestPaste } from './parse.js';

describe('parseGuestPaste', () => {
  it('detects name, phone and email in any order and normalises to E.164', () => {
    const rows = parseGuestPaste(
      ['Adaeze Okafor, 08031234567, ada@example.com', '08039876543; Emeka', 'funmi@example.com Funmi Ade'].join('\n'),
      'NG',
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      name: 'Adaeze Okafor',
      phone: '+2348031234567',
      phoneInvalid: false,
      email: 'ada@example.com',
      emailInvalid: false,
    });
    expect(rows[1]).toMatchObject({ name: 'Emeka', phone: '+2348039876543' });
    expect(rows[2]).toMatchObject({ name: 'Funmi Ade', email: 'funmi@example.com', phone: null });
  });

  it('flags invalid contacts without dropping the row (UF-06 edge cases)', () => {
    const rows = parseGuestPaste(['Ada, 123', 'Bob, not-an-email'].join('\n'), 'NG');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe('Ada');
    expect(rows[1]).toMatchObject({ name: 'Bob not-an-email', email: null });
  });

  it('skips blank lines and keeps the raw line for preview fixes', () => {
    const rows = parseGuestPaste('\n  \nAda 08031234567\n', 'NG');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.raw).toBe('Ada 08031234567');
    expect(rows[0]?.phone).toBe('+2348031234567');
  });

  it('resolves national numbers against the event country', () => {
    const rows = parseGuestPaste(['Amara 02079460000'].join('\n'), 'GB');
    expect(rows[0]?.phone).toBe('+442079460000');
  });
});
