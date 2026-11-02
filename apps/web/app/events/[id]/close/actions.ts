'use server';

import {
  closeEvent,
  closeEventSchema,
  confirmDelivery,
  confirmDeliverySchema,
  createReview,
  createReviewSchema,
  reportReview,
  reportReviewSchema,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/close`);
  revalidatePath(`/events/${eventId}`);
}

export const confirmDeliveryAction = userAction(confirmDeliverySchema, async (input, ctx) => {
  const booking = await confirmDelivery(ctx.actor, input);
  revalidate(booking.eventId);
  return booking;
});

export const closeEventAction = userAction(closeEventSchema, async (input, ctx) => {
  const result = await closeEvent(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const createReviewAction = userAction(createReviewSchema, async (input, ctx) => {
  const result = await createReview(ctx.actor, input);
  revalidate(result.eventId);
  return result;
});

export const reportReviewAction = userAction(reportReviewSchema, async (input, ctx) => {
  const result = await reportReview(ctx.actor, input);
  return result;
});
