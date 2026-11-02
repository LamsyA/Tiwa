'use server';

import { markAllNotificationsRead, markNotificationRead, markReadSchema } from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { userAction } from '@/lib/ctx.js';

export const markReadAction = userAction(markReadSchema, async (input, ctx) => {
  const result = await markNotificationRead(ctx.actor, input);
  revalidatePath('/notifications');
  return result;
});

export const markAllAction = userAction(z.object({}), async (_input, ctx) => {
  const result = await markAllNotificationsRead(ctx.actor);
  revalidatePath('/notifications');
  return result;
});
