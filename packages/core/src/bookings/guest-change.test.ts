import { describe, expect, it } from 'vitest';
import { issueChangeToken, verifyChangeToken } from './guest-change.js';

const SECRET = 'test-secret-for-change-links';
const VERSION = '01a1e84e-3e1f-7aa1-9e95-b70e4496be7e';

describe('change approve link (D-X84)', () => {
  it('round-trips to the version it was issued for', () => {
    const { token } = issueChangeToken(VERSION, SECRET);
    expect(verifyChangeToken(token, SECRET)).toBe(VERSION);
  });

  it('refuses a tampered token', () => {
    const { token } = issueChangeToken(VERSION, SECRET);
    const [, exp, mac] = token.split('.');
    const forged = `${Buffer.from('01a1e84e-0000-7aa1-9e95-b70e4496be7e').toString('base64url')}.${exp}.${mac}`;
    expect(verifyChangeToken(forged, SECRET)).toBeNull();
  });

  it('refuses another secret', () => {
    const { token } = issueChangeToken(VERSION, SECRET);
    expect(verifyChangeToken(token, 'another-secret')).toBeNull();
  });

  it('expires after 14 days', () => {
    const issued = new Date('2026-11-01T00:00:00Z');
    const { token, expiresAt } = issueChangeToken(VERSION, SECRET, issued);
    expect(expiresAt.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(verifyChangeToken(token, SECRET, new Date('2026-11-14T23:00:00Z'))).toBe(VERSION);
    expect(verifyChangeToken(token, SECRET, new Date('2026-11-15T00:00:01Z'))).toBeNull();
  });

  it('refuses garbage', () => {
    expect(verifyChangeToken('not-a-token', SECRET)).toBeNull();
    expect(verifyChangeToken('a.b', SECRET)).toBeNull();
  });
});
