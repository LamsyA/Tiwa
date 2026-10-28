import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateToken, slugify, uniqueSlug, uuidv7 } from './ids.js';

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

describe('uuidv7', () => {
  it('matches the v7 shape with correct version and variant bits', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Date.now() }), (nowMs) => {
        expect(uuidv7(nowMs)).toMatch(UUID_V7_RE);
      }),
      { numRuns: 200 },
    );
  });

  it('embeds the timestamp so ids sort by creation time', () => {
    const first = uuidv7(1_000);
    const second = uuidv7(2_000);
    expect(first < second).toBe(true);
    expect(first.slice(0, 13)).not.toBe(second.slice(0, 13));
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
  });
});

describe('generateToken', () => {
  it('defaults to 256 bits of base64url', () => {
    const token = generateToken();
    expect(token).toMatch(BASE64URL_RE);
    expect(token).toHaveLength(43); // ceil(32/3)*4 without padding
  });

  it('is unique and refuses short lengths', () => {
    expect(generateToken(16)).not.toBe(generateToken(16));
    expect(() => generateToken(8)).toThrow(RangeError);
  });
});

describe('slugify / uniqueSlug', () => {
  it('converts names to url-safe slugs', () => {
    expect(slugify("Ada's 40th Birthday!")).toBe('ada-s-40th-birthday');
    expect(slugify('  Church Programme 2026  ')).toBe('church-programme-2026');
    expect(slugify('Owambe!!! Lagos')).toBe('owambe-lagos');
  });

  it('only ever emits lowercase alphanumerics and hyphens', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (text) => {
        expect(slugify(text)).toMatch(/^[a-z0-9-]*$/);
      }),
    );
  });

  it('uniqueSlug appends a random suffix within the length budget', () => {
    const first = uniqueSlug('Ada Birthday');
    const second = uniqueSlug('Ada Birthday');
    expect(first).not.toBe(second);
    expect(first.startsWith('ada-birthday-')).toBe(true);
    expect(first.length).toBeLessThanOrEqual(60);
  });
});
