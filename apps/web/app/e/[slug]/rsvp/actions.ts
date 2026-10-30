'use server';

import { RateLimitedError, sharedLinkRsvp, sharedLinkRsvpSchema } from '@tiwa/core';
import { RATE_LIMITS } from '@tiwa/core/auth/rate-limit';
import { action } from '@/lib/ctx.js';
import { checkRedisRateLimit } from '@/lib/rate-store.js';

/** Public (UF-09): no account; rate-limited per IP like the §13 family. */
export const submitSharedRsvp = action(sharedLinkRsvpSchema, async (input, ctx) => {
  const budget = RATE_LIMITS.sharedRsvpPerIp;
  const check = await checkRedisRateLimit(`rsvp:shared:ip:${ctx.ip}`, budget.limit, budget.windowSec);
  if (!check.allowed)
    throw new RateLimitedError('Too many RSVPs — try again later', { retryAfterSec: check.retryAfterSec });
  return sharedLinkRsvp(input);
});
