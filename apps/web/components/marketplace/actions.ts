'use server';

import {
  instantBook,
  instantBookSchema,
  listShortlist,
  listShortlistSchema,
  requestQuotes,
  requestSiteVisit,
  requestSiteVisitSchema,
  toggleShortlist,
  toggleShortlistSchema,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { userAction } from '@/lib/ctx.js';

/** Instant venue booking (QTE-06, P7-T10): no quote step, date held in the same transaction. */
export const instantBookAction = userAction(instantBookSchema, async (input, ctx) => {
  return instantBook(ctx.actor, input);
});

/** Site visit request (P7-T11): host proposes up to 3 tour times. */
export const requestSiteVisitAction = userAction(requestSiteVisitSchema, async (input, ctx) => {
  return requestSiteVisit(ctx.actor, input);
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

/** One-vendor quote request straight from a profile or search card (D-X39). */
export const requestQuoteAction = userAction(
  z.object({
    eventId: z.string().uuid(),
    vendorOrgId: z.string().uuid(),
    category: z.string().min(1).max(60),
    notes: z.string().trim().max(2000).optional(),
    budgetMaxMinor: z.string().regex(/^\d+$/).optional(),
  }),
  async (input, ctx) => {
    const result = await requestQuotes(ctx.actor, {
      eventId: input.eventId,
      category: input.category,
      vendorOrgIds: [input.vendorOrgId],
      ...(input.notes ? { notes: input.notes } : {}),
      ...(input.budgetMaxMinor ? { budgetMaxMinor: input.budgetMaxMinor } : {}),
    });
    revalidatePath(`/events/${input.eventId}`, 'layout');
    return { requestId: result.requests[0]?.id ?? null };
  },
);
