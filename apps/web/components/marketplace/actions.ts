'use server';

import { listShortlist, listShortlistSchema, toggleShortlist, toggleShortlistSchema } from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

/** Shared marketplace search actions (P6-T05/T06). */
export const toggleShortlistAction = userAction(toggleShortlistSchema, async (input, ctx) => {
  const result = await toggleShortlist(ctx.actor, input);
  revalidatePath('/vendors');
  revalidatePath('/planners');
  return result;
});

export const getShortlistAction = userAction(listShortlistSchema, async (input, ctx) => {
  return listShortlist(ctx.actor, input);
});
