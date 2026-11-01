'use server';

import {
  createQuote,
  createQuoteSchema,
  declineEnquiry,
  quoteIdSchema,
  sendQuote,
  updateQuote,
  updateQuoteSchema,
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
