import { Redis } from 'ioredis';

// Per-provider send limiters (Backend.md §10: SMS 20/s, WhatsApp 50/s,
// email 10/s). Sliding window in one Lua round-trip, shared across worker
// replicas through Redis. `acquire` waits (short sleeps) instead of failing
// fast — bursts smooth out instead of burning BullMQ retries.

const WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
if redis.call('ZCARD', key) >= limit then return 0 end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window)
return 1
`;

export const PROVIDER_LIMITS = {
  email: { limit: 10, windowSec: 1 },
  sms: { limit: 20, windowSec: 1 },
  whatsapp: { limit: 50, windowSec: 1 },
} as const;

export type ProviderName = keyof typeof PROVIDER_LIMITS;

export async function tryAcquire(redis: Redis, provider: ProviderName, nowMs = Date.now()): Promise<boolean> {
  const { limit, windowSec } = PROVIDER_LIMITS[provider];
  const granted = (await redis.eval(
    WINDOW_SCRIPT,
    1,
    `ratelimit:send:${provider}`,
    String(Math.floor(nowMs / 1000)),
    String(windowSec),
    String(limit),
    `${nowMs}:${Math.random().toString(36).slice(2)}`,
  )) as number;
  return granted === 1;
}

/** Wait up to `maxWaitMs` for a send slot; returns false on timeout (caller requeues). */
export async function acquire(
  redis: Redis,
  provider: ProviderName,
  maxWaitMs = 60_000,
  sleepMs = 250,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    if (await tryAcquire(redis, provider)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
}
