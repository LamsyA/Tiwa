'use server';

import {
  checkIn,
  checkInById,
  checkInByIdSchema,
  checkInSchema,
  searchPasses,
  syncOfflineCheckins,
  syncOfflineSchema,
} from '@tiwa/core';
import { env } from '@tiwa/config';
import { z } from 'zod';
import { userAction } from '@/lib/ctx.js';
import { checkinChannel, publishLive } from '@/lib/live.js';

const secret = () => env.AUTH_SECRET || 'dev-secret';

/** Live scan (P11-T06, UF-23-1): writes the row, then fans out the counter. */
export const scanAction = userAction(checkInSchema, async (input, ctx) => {
  const result = await checkIn(ctx.actor, input, secret());
  if (result.result === 'OK') await publishLive(checkinChannel(input.eventId), 'checkin');
  return result;
});

export const syncOfflineAction = userAction(syncOfflineSchema, async (input, ctx) => {
  const result = await syncOfflineCheckins(ctx.actor, input, secret());
  if (result.ok > 0) await publishLive(checkinChannel(input.eventId), 'checkin');
  return result;
});

/** Manual name search (staff scanner fallback, UF-23). */
export const searchPassesAction = userAction(
  z.object({ eventId: z.string().uuid(), query: z.string().trim().min(2).max(120) }),
  async (input, ctx) => searchPasses(ctx.actor, input.eventId, input.query),
);

/** Check in one pass picked from the name search. */
export const checkInByIdAction = userAction(checkInByIdSchema, async (input, ctx) => {
  const result = await checkInById(ctx.actor, input, secret());
  if (result.result === 'OK') await publishLive(checkinChannel(input.eventId), 'checkin');
  return result;
});
