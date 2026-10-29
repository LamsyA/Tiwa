import { describe, expect, it } from 'vitest';
import { checkRateLimit, MemoryRateLimitStore, RATE_LIMITS } from './rate-limit.js';

describe('sliding-window rate limit', () => {
  it('allows up to the limit then denies with retry-after', async () => {
    const store = new MemoryRateLimitStore();
    const limit = { limit: 3, windowSec: 600 };
    expect((await checkRateLimit(store, 'k', limit, 1000)).allowed).toBe(true);
    expect((await checkRateLimit(store, 'k', limit, 1001)).allowed).toBe(true);
    expect((await checkRateLimit(store, 'k', limit, 1002)).allowed).toBe(true);
    const denied = await checkRateLimit(store, 'k', limit, 1003);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
    // Window slides: the first hit ages out at t=1600.
    expect((await checkRateLimit(store, 'k', limit, 1601)).allowed).toBe(true);
  });

  it('tracks keys independently', async () => {
    const store = new MemoryRateLimitStore();
    const limit = { limit: 1, windowSec: 600 };
    expect((await checkRateLimit(store, 'a', limit, 1000)).allowed).toBe(true);
    expect((await checkRateLimit(store, 'a', limit, 1001)).allowed).toBe(false);
    expect((await checkRateLimit(store, 'b', limit, 1001)).allowed).toBe(true);
  });

  it('encodes the Backend §13 budgets', () => {
    expect(RATE_LIMITS.otpSendPerPhone).toEqual({ limit: 3, windowSec: 600 });
    expect(RATE_LIMITS.otpSendPerIp).toEqual({ limit: 20, windowSec: 3600 });
    expect(RATE_LIMITS.loginPerIp).toEqual({ limit: 10, windowSec: 600 });
    expect(RATE_LIMITS.otpVerifyPerPhone).toEqual({ limit: 5, windowSec: 900 });
  });
});
