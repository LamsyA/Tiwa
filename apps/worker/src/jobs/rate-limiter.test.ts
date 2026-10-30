import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { acquire, tryAcquire } from './rate-limiter.js';

// Needs Redis (dev services / CI). No Redis → skipped, like the S3 tests.
let redis: Redis | null = null;
try {
  const candidate = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
  });
  await candidate.ping();
  redis = candidate;
} catch {
  redis = null;
}

afterAll(async () => {
  await redis?.quit().catch(() => undefined);
});

describe.runIf(redis !== null)('provider rate limiter', () => {
  it('grants up to the per-second budget, then denies', async () => {
    const client = redis as unknown as Redis;
    await client.del('ratelimit:send:email');
    let granted = 0;
    for (let i = 0; i < 12; i += 1) {
      if (await tryAcquire(client, 'email')) granted += 1;
    }
    expect(granted).toBe(10);
    await client.del('ratelimit:send:email');
  });

  it('acquire waits for the next window instead of failing', async () => {
    const client = redis as unknown as Redis;
    await client.del('ratelimit:send:sms');
    for (let i = 0; i < 20; i += 1) {
      expect(await tryAcquire(client, 'sms')).toBe(true);
    }
    expect(await tryAcquire(client, 'sms')).toBe(false);
    expect(await acquire(client, 'sms', 3000, 100)).toBe(true);
    await client.del('ratelimit:send:sms');
  });
});
