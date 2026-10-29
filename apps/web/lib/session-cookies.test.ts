import { getCookies } from 'better-auth/cookies';
import { describe, expect, it } from 'vitest';
import { authOptions } from './auth.js';

// Gate P2: sessions are httpOnly / Secure / SameSite=Lax (Backend.md §12).
// The e2e flow checks the real cookie on localhost; this checks the
// production shape (https APP_URL), where Secure must be on.
describe('session cookie attributes', () => {
  it('production (https): httpOnly, Secure, SameSite=Lax, 30-day lifetime', () => {
    const { sessionToken } = getCookies({ ...authOptions, baseURL: 'https://tiwa.app' });
    expect(sessionToken.attributes).toMatchObject({ httpOnly: true, secure: true, path: '/' });
    expect(sessionToken.attributes.sameSite.toLowerCase()).toBe('lax');
    expect(sessionToken.name.startsWith('__Secure-')).toBe(true);
    expect(sessionToken.attributes.maxAge).toBe(60 * 60 * 24 * 30);
  });

  it('local http keeps httpOnly + SameSite=Lax', () => {
    const { sessionToken } = getCookies({ ...authOptions, baseURL: 'http://localhost:3000' });
    expect(sessionToken.attributes.httpOnly).toBe(true);
    expect(sessionToken.attributes.sameSite.toLowerCase()).toBe('lax');
  });
});
