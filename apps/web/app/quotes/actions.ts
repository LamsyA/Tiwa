'use server';

import {
  cancelSiteVisit,
  completeSiteVisit,
  confirmSiteVisit,
  confirmSiteVisitSchema,
  createQuote,
  createQuoteSchema,
  declineEnquiry,
  declineSiteVisit,
  quoteIdSchema,
  sendQuote,
  updateQuote,
  updateQuoteSchema,
  visitIdSchema,
  withdrawQuote,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { userAction } from '@/lib/ctx.js';

/** Vendor quoting (P7-T04): drafts live in the builder, sending notifies the host. */
export const createQuoteAction = userAction(createQuoteSchema, async (input, ctx) => {
  const result = await createQuote(ctx.actor, input);
  revalidatePath('/quotes');
  return result;
});

export const sendQuoteAction = userAction(quoteIdSchema, async (input, ctx) => {
  const result = await sendQuote(ctx.actor, input);
  revalidatePath('/quotes');
  return result;
});

export const withdrawQuoteAction = userAction(quoteIdSchema, async (input, ctx) => {
  const result = await withdrawQuote(ctx.actor, input);
  revalidatePath('/quotes');
  return result;
});

/** Vendor revises an undecided quote (P7-T10): re-totals and re-checks venue slots. */
export const updateQuoteAction = userAction(updateQuoteSchema, async (input, ctx) => {
  const result = await updateQuote(ctx.actor, input);
  revalidatePath('/quotes');
  return result;
});

export const declineEnquiryAction = userAction(z.object({ requestId: z.string().uuid() }), async (input, ctx) => {
  const result = await declineEnquiry(ctx.actor, input);
  revalidatePath('/quotes');
  return result;
});

/** Venue site visit decisions (P7-T11). */
export const confirmSiteVisitAction = userAction(confirmSiteVisitSchema, async (input, ctx) => {
  const result = await confirmSiteVisit(ctx.actor, input);
  revalidatePath('/quotes');
  return result;
});

export const declineSiteVisitAction = userAction(visitIdSchema, async (input, ctx) => {
  const result = await declineSiteVisit(ctx.actor, input);
  revalidatePath('/quotes');
  return result;
});

export const completeSiteVisitAction = userAction(visitIdSchema, async (input, ctx) => {
  const result = await completeSiteVisit(ctx.actor, input);
  revalidatePath('/quotes');
  return result;
});

export const cancelSiteVisitAction = userAction(visitIdSchema, async (input, ctx) => {
  const result = await cancelSiteVisit(ctx.actor, input);
  revalidatePath('/quotes');
  return result;
});
