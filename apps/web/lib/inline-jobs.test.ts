import { describe, expect, it } from 'vitest';
import { inlineJobsEnabled } from './inline-jobs.js';

describe('inline jobs switch (D-X20)', () => {
  it('is on only with INLINE_JOBS=1', () => {
    expect(inlineJobsEnabled({ INLINE_JOBS: '1' })).toBe(true);
    expect(inlineJobsEnabled({ INLINE_JOBS: '0' })).toBe(false);
    expect(inlineJobsEnabled({})).toBe(false);
  });
});
