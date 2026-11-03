import { describe, expect, it } from 'vitest';
import { authMethods } from './auth-methods.js';

describe('authMethods (D-X48)', () => {
  it('keeps phone and Google off unless switched on', () => {
    expect(authMethods({})).toEqual({ phone: false, google: false });
    expect(authMethods({ AUTH_PHONE_ENABLED: '1' }).phone).toBe(true);
  });

  it('needs both the flag and Google credentials', () => {
    expect(authMethods({ AUTH_GOOGLE_ENABLED: '1' }).google).toBe(false);
    expect(authMethods({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' }).google).toBe(false);
    expect(authMethods({ AUTH_GOOGLE_ENABLED: '1', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' }).google).toBe(
      true,
    );
  });
});
