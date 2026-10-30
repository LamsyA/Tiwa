import { describe, expect, it } from 'vitest';
import { waMeLink } from './wame.js';

describe('waMeLink', () => {
  it('builds a wa.me URL with the personal link URL-encoded (UF-07-7)', () => {
    const link = waMeLink('+2348012345678', "You're invited! https://tiwa.app/i/abc123?x=1&y=2");
    expect(link).toBe(
      "https://wa.me/2348012345678?text=You're%20invited!%20https%3A%2F%2Ftiwa.app%2Fi%2Fabc123%3Fx%3D1%26y%3D2",
    );
  });

  it('rejects non-E.164 phones', () => {
    expect(() => waMeLink('08031234567', 'hi')).toThrow();
    expect(() => waMeLink('+234', 'hi')).toThrow();
    expect(() => waMeLink('', 'hi')).toThrow();
  });
});
