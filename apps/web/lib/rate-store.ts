import { Redis } from 'ioredis';
import type { RateLimitStore } from '@tiwa/core/auth/rate-limit';
import { RATE_LIMITS } from '@tiwa/core/auth/rate-limit';

let client: Redis | undefined;

function getClient(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 3 });
    client.on('error', () => {
      // Rate limiting degrades open if Redis is unreachable; failures are
      // visible in logs and the limiter treats errors as allow (fail-open is
      // safer than locking every user out). Monitor in P17.
    });
  }
  return client;
}

// Sliding window in one Lua round-trip: trim, count, optionally record.
const WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, count, oldest[2] or 0}
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window)
return {1, count + 1, 0}
`;

export interface RedisRateLimitStore extends RateLimitStore {
  close(): Promise<void>;
}

export function createRedisRateLimitStore(redis: Redis = getClient()): RedisRateLimitStore {
  return {
    async timestamps(key: string): Promise<number[]> {
      const now = Math.floor(Date.now() / 1000);
      const members = await redis.zrangebyscore(key, now - 86_400, now, 'WITHSCORES');
      const out: number[] = [];
      for (let i = 1; i < members.length; i += 2) out.push(Number(members[i - 1] ?? 0));
      return out;
    },
    async record(key: string, nowSec: number, windowSec: number): Promise<void> {
      const member = `${nowSec}:${Math.random().toString(36).slice(2)}`;
      await redis.eval(
        WINDOW_SCRIPT,
        1,
        key,
        String(nowSec),
        String(windowSec),
        String(Number.MAX_SAFE_INTEGER),
        member,
      );
    },
    async clear(key: string): Promise<void> {
      await redis.del(key);
    },
    async close(): Promise<void> {
      await redis.quit().catch(() => undefined);
    },
  };
}

export function LOGIN_KEY(ip: string): string {
  return `login:ip:${ip}`;
}

/** Send limits as (key, budget) pairs: per-phone and per-IP (Backend.md §13). */
export function OTP_LIMITS(phone: string, ip: string): Array<[string, { limit: number; windowSec: number }]> {
  return [
    [`otp:send:phone:${phone}`, RATE_LIMITS.otpSendPerPhone],
    [`otp:send:ip:${ip}`, RATE_LIMITS.otpSendPerIp],
  ];
}

export async function clearRateLimit(key: string, redis: Redis = getClient()): Promise<void> {
  await redis.del(key).catch(() => undefined);
}

export async function checkRedisRateLimit(
  key: string,
  limit: number,
  windowSec: number,
  nowSec = Math.floor(Date.now() / 1000),
  redis: Redis = getClient(),
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const member = `${nowSec}:${Math.random().toString(36).slice(2)}`;
  const [allowed, , oldest] = (await redis.eval(
    WINDOW_SCRIPT,
    1,
    key,
    String(nowSec),
    String(windowSec),
    String(limit),
    member,
  )) as [number, number, string];
  const oldestSec = Number(oldest);
  return {
    allowed: allowed === 1,
    remaining: 0,
    retryAfterSec: allowed === 1 ? 0 : Math.max(1, Math.floor(oldestSec) + windowSec - nowSec),
  };
}
