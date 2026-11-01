'use server';

import {
  acceptQuote,
  acceptQuoteSchema,
  declineQuote,
  declineQuoteSchema,
  requestChangesSchema,
  requestQuoteChanges,
  requestQuotes,
  requestQuotesSchema,
} from '@tiwa/core';
import { userAction } from '@/lib/ctx.js';

/** Host requests quotes from up to 5 vendors in a category (P7-T03). */
export const requestQuotesAction = userAction(requestQuotesSchema, async (input, ctx) => {
  return requestQuotes(ctx.actor, input);
});

/** Host-side quote decisions (P7-T05/T06). Acceptance records user, time and IP (UF-16-1). */
export const declineQuoteAction = userAction(declineQuoteSchema, async (input, ctx) => {
  return declineQuote(ctx.actor, input);
});

export const requestChangesAction = userAction(requestChangesSchema, async (input, ctx) => {
  const result = await requestQuoteChanges(ctx.actor, input);
  return result;
});

export const acceptQuoteAction = userAction(acceptQuoteSchema, async (input, ctx) => {
  return acceptQuote(ctx.actor, input, { ip: ctx.ip });
});
