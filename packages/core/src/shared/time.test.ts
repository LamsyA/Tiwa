import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addHours,
  addMinutes,
  diffMs,
  isFuture,
  isPast,
  maxDate,
  minDate,
  nowIso,
  startOfDayUtc,
} from './time.js';

const arbDate = () => fc.integer({ min: 0, max: 4_102_444_800_000 }).map((ms) => new Date(ms));

describe('time', () => {
  it('addDays/addHours/addMinutes compose and diffMs inverts them', () => {
    fc.assert(
      fc.property(arbDate(), fc.integer({ min: -1000, max: 1000 }), (date, n) => {
        expect(diffMs(addDays(date, n), date)).toBe(n * 86_400_000);
        expect(diffMs(addHours(date, n), date)).toBe(n * 3_600_000);
        expect(diffMs(addMinutes(date, n), date)).toBe(n * 60_000);
        expect(addDays(date, n).getTime()).toBe(new Date(date.getTime() + n * 86_400_000).getTime());
      }),
    );
  });

  it('isPast/isFuture split around the reference instant', () => {
    const at = new Date('2026-11-04T12:00:00.000Z');
    expect(isPast(new Date('2026-11-04T11:59:59.999Z'), at)).toBe(true);
    expect(isFuture(new Date('2026-11-04T12:00:00.001Z'), at)).toBe(true);
    expect(isPast(at, at)).toBe(false);
    expect(isFuture(at, at)).toBe(false);
  });

  it('startOfDayUtc is idempotent and min/max pick correctly', () => {
    fc.assert(
      fc.property(arbDate(), (date) => {
        const start = startOfDayUtc(date);
        expect(startOfDayUtc(start).getTime()).toBe(start.getTime());
        expect(start.getUTCHours()).toBe(0);
        expect(diffMs(date, start) >= 0 && diffMs(date, start) < 86_400_000).toBe(true);
      }),
    );
    const a = new Date('2026-01-01T00:00:00.000Z');
    const b = new Date('2026-06-01T00:00:00.000Z');
    expect(minDate(a, b)).toBe(a);
    expect(maxDate(a, b)).toBe(b);
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
