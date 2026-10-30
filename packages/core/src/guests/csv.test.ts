import { describe, expect, it } from 'vitest';
import { applyCsvMapping, suggestCsvMapping } from './csv.js';

describe('suggestCsvMapping', () => {
  it('matches headers by alias, case-insensitively', () => {
    expect(suggestCsvMapping(['Full Name', 'Mobile', 'E-Mail', 'Category'])).toEqual({
      name: 0,
      phone: 1,
      email: 2,
      group: 3,
    });
  });

  it('leaves unknown columns unmapped', () => {
    expect(suggestCsvMapping(['name', 'seat', 'notes'])).toEqual({ name: 0 });
  });
});

describe('applyCsvMapping', () => {
  it('maps rows by column index and skips blank rows', () => {
    const rows = applyCsvMapping(
      [
        ['Ada', '08031234567', 'ada@example.com', 'Family', '2', 'Jollof', 'No nuts'],
        ['', '', '', '', '', '', ''],
        ['Bob', '', '', '', '', '', ''],
      ],
      { name: 0, phone: 1, email: 2, group: 3, plusOnes: 4, meal: 5, dietary: 6 },
    );
    expect(rows).toEqual([
      {
        name: 'Ada',
        phone: '08031234567',
        email: 'ada@example.com',
        group: 'Family',
        plusOnes: 2,
        meal: 'Jollof',
        dietary: 'No nuts',
      },
      { name: 'Bob' },
    ]);
  });

  it('ignores non-numeric plus-ones', () => {
    const rows = applyCsvMapping([['Ada', 'two']], { name: 0, plusOnes: 1 });
    expect(rows).toEqual([{ name: 'Ada' }]);
  });
});
