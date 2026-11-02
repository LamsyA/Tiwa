'use server';

import {
  approvePortfolioItem,
  approvePortfolioSchema,
  closeEvent,
  closeEventSchema,
  confirmDelivery,
  confirmDeliverySchema,
  createReview,
  createReviewSchema,
  declinePortfolioItem,
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

async function portfolioEventId(itemId: string): Promise<string | null> {
  const { prisma } = await import('@tiwa/db');
  const item = await prisma.portfolioItem.findUnique({ where: { id: itemId }, select: { eventId: true } });
  return item?.eventId ?? null;
}

export const approvePortfolioAction = userAction(approvePortfolioSchema, async (input, ctx) => {
  const eventId = await portfolioEventId(input.itemId);
  const result = await approvePortfolioItem(ctx.actor, input);
  if (eventId) revalidate(eventId);
  return result;
});

export const declinePortfolioAction = userAction(approvePortfolioSchema, async (input, ctx) => {
  const eventId = await portfolioEventId(input.itemId);
  const result = await declinePortfolioItem(ctx.actor, input);
  if (eventId) revalidate(eventId);
  return result;
});
