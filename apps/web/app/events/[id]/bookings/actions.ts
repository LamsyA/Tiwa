'use server';

import { requestBookingChange, requestChangeSchema, respondBookingChange, respondChangeSchema } from '@tiwa/core';
import { userAction } from '@/lib/ctx.js';

/** Booking change requests (QTE-07, P7-T08): propose a new version, accept or decline it. */
export const requestChangeAction = userAction(requestChangeSchema, async (input, ctx) => {
  return requestBookingChange(ctx.actor, input);
});

export const respondChangeAction = userAction(respondChangeSchema, async (input, ctx) => {
  return respondBookingChange(ctx.actor, input, { ip: ctx.ip });
});
