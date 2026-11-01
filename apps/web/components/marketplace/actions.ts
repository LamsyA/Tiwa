'use server';

import { instantBook, instantBookSchema, listShortlist, listShortlistSchema, toggleShortlist, toggleShortlistSchema } from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

/** Instant venue booking (QTE-06, P7-T10): no quote step, date held in the same transaction. */
export const instantBookAction = userAction(instantBookSchema, async (input, ctx) => {
  return instantBook(ctx.actor, input);
});

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
