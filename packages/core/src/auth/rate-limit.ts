// Sliding-window rate limits (Backend.md §13). Storage-agnostic: production
// wires Redis (apps/web/lib/rate-store.ts); tests use the memory store.
export interface RateLimitStore {
  /** Unix epoch seconds of the hits still inside the window, oldest first. */
  timestamps(key: string): Promise<number[]>;
  /** Record a hit at `nowSec` and trim entries older than the window. */
  record(key: string, nowSec: number, windowSec: number): Promise<void>;
  /** Remove all hits (tests, lockout release). */
  clear(key: string): Promise<void>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  async timestamps(key: string): Promise<number[]> {
    return [...(this.hits.get(key) ?? [])];
  }

  async record(key: string, nowSec: number, windowSec: number): Promise<void> {
    const cutoff = nowSec - windowSec;
    this.hits.set(
      key,
      [...(this.hits.get(key) ?? []), nowSec].filter((t) => t > cutoff),
    );
  }

  async clear(key: string): Promise<void> {
    this.hits.delete(key);
  }
}

export interface RateLimit {
  limit: number;
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** Sliding-window check-and-record. Call BEFORE the guarded action. */
export async function checkRateLimit(
  store: RateLimitStore,
  key: string,
  { limit, windowSec }: RateLimit,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<RateLimitResult> {
  const cutoff = nowSec - windowSec;
  const recent = (await store.timestamps(key)).filter((t) => t > cutoff);
  if (recent.length >= limit) {
    const oldest = Math.min(...recent);
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, oldest + windowSec - nowSec) };
  }
  await store.record(key, nowSec, windowSec);
  return { allowed: true, remaining: limit - recent.length - 1, retryAfterSec: 0 };
}

// Backend.md §13 budgets.
export const RATE_LIMITS = {
  otpSendPerPhone: { limit: 3, windowSec: 600 },
  otpSendPerIp: { limit: 20, windowSec: 3600 },
  loginPerIp: { limit: 10, windowSec: 600 },
  otpVerifyPerPhone: { limit: 5, windowSec: 900 },
} as const satisfies Record<string, RateLimit>;

/** Wrong-OTP lockout: 5 failures within 15 min locks the phone for up to 15 min (UF-01-4). Enforced as a sliding window: the 6th attempt inside the window is denied until the oldest failure ages out. */
export function otpVerifyKey(phone: string): string {
  return `otp:verify:phone:${phone}`;
}

export function loginKey(ip: string): string {
  return `login:ip:${ip}`;
}
