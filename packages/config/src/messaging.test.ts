import { describe, expect, it } from 'vitest';
import { SMS_SEGMENT_COST_MINOR_DEFAULT, smsSegmentCostMinor } from './messaging.js';

describe('smsSegmentCostMinor', () => {
  it('returns per-country estimates with a default fallback', () => {
    expect(smsSegmentCostMinor('NG')).toBeGreaterThan(0);
    expect(smsSegmentCostMinor('ng')).toBe(smsSegmentCostMinor('NG'));
    expect(smsSegmentCostMinor('XX')).toBe(SMS_SEGMENT_COST_MINOR_DEFAULT);
  });
});
