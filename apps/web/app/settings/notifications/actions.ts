'use server';

import { setPreferences, setPreferencesSchema } from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

/** Per-type channels + quiet hours (P13-T03, MSG-15). */
export const savePreferencesAction = userAction(setPreferencesSchema, async (input, ctx) => {
  const result = await setPreferences(ctx.actor, input);
  revalidatePath('/settings/notifications');
  return result;
});
