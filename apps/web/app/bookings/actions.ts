'use server';

import { updateRunStatus, updateRunStatusSchema, vendorCheckIn, vendorCheckInSchema } from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';
import { dayChannel, publishLive } from '@/lib/live.js';

/** Vendor one-tap arrival (P12-T04, DAY-03): fans out so the planner's
 * day screen updates within seconds (UF-24-3). */
export const vendorCheckInAction = userAction(vendorCheckInSchema, async (input, ctx) => {
  const result = await vendorCheckIn(ctx.actor, input);
  await publishLive(dayChannel(result.eventId), 'day');
  revalidatePath('/bookings');
  return result;
});

export const vendorStatusAction = userAction(updateRunStatusSchema, async (input, ctx) => {
  const result = await updateRunStatus(ctx.actor, input);
  await publishLive(dayChannel(input.eventId), 'day');
  revalidatePath('/bookings');
  return result;
});
