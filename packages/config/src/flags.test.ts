import { describe, expect, it } from 'vitest';
import { resolveFlag } from './flags.js';

const prod = { APP_ENV: 'production' } as NodeJS.ProcessEnv;
const local = { APP_ENV: 'local' } as NodeJS.ProcessEnv;

describe('resolveFlag precedence', () => {
  it('defaults: OFF in production, ON elsewhere', () => {
    expect(resolveFlag('payments.held', {}, prod)).toBe(false);
    expect(resolveFlag('payments.held', {}, local)).toBe(true);
  });

  it('global DB override beats the default', () => {
    expect(resolveFlag('ai.enabled', { global: true }, prod)).toBe(true);
    expect(resolveFlag('ai.enabled', { global: false }, local)).toBe(false);
  });

  it('country override beats global', () => {
    expect(resolveFlag('whatsapp.bulk', { global: true, country: false }, prod)).toBe(false);
    expect(resolveFlag('whatsapp.bulk', { global: false, country: true }, prod)).toBe(true);
  });

  it('env override beats everything (kill switch without a deploy or DB write)', () => {
    expect(
      resolveFlag('payments.payouts', { global: true, country: true }, { ...local, FLAG_PAYMENTS_PAYOUTS: '0' }),
    ).toBe(false);
    expect(resolveFlag('payments.payouts', { country: false }, { ...prod, FLAG_PAYMENTS_PAYOUTS: 'true' })).toBe(true);
  });

  it('rejects malformed env overrides', () => {
    expect(() => resolveFlag('ai.enabled', {}, { ...local, FLAG_AI_ENABLED: 'yes' })).toThrow();
  });
});
