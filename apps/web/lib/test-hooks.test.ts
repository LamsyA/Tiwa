import { describe, expect, it } from 'vitest';
import { isTestHookEnabled } from './test-hooks.js';

const fakeLocal = { APP_ENV: 'local', SMS_PROVIDER: 'fake', EMAIL_PROVIDER: 'fake' };

describe('isTestHookEnabled', () => {
  it('needs the explicit opt-in', () => {
    expect(isTestHookEnabled({}, fakeLocal)).toBe(false);
    expect(isTestHookEnabled({ E2E_TEST_HOOKS: '1' }, fakeLocal)).toBe(true);
  });

  it('is never on in production or with a real provider', () => {
    expect(isTestHookEnabled({ E2E_TEST_HOOKS: '1' }, { ...fakeLocal, APP_ENV: 'production' })).toBe(false);
    expect(isTestHookEnabled({ E2E_TEST_HOOKS: '1' }, { ...fakeLocal, SMS_PROVIDER: 'termii' })).toBe(false);
    expect(isTestHookEnabled({ E2E_TEST_HOOKS: '1' }, { ...fakeLocal, EMAIL_PROVIDER: 'resend' })).toBe(false);
  });
});
