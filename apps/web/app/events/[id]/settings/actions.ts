'use server';

import {
  cancelEvent,
  completeCoverSchema,
  completeCoverUpload,
  eventIdSchema,
  removeCover,
  setVendorPriceVisibility,
  setPriceVisibilitySchema,
  startCoverSchema,
  startCoverUpload,
  updateEventAppearance,
  updateEventAppearanceSchema,
  updateEventDetails,
  updateEventDetailsSchema,
  updateEventFeatures,
  updateEventFeaturesSchema,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}`, 'layout');
}

export const saveEventDetails = userAction(updateEventDetailsSchema, async (input, ctx) => {
  await updateEventDetails(ctx.actor, input);
  revalidate(input.eventId);
});

export const saveEventFeatures = userAction(updateEventFeaturesSchema, async (input, ctx) => {
  await updateEventFeatures(ctx.actor, input);
  revalidate(input.eventId);
});

/** EVT-12: planner-only (core enforces); revalidates money and vendor pages that show amounts. */
export const savePriceVisibility = userAction(setPriceVisibilitySchema, async (input, ctx) => {
  const result = await setVendorPriceVisibility(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const saveEventAppearance = userAction(updateEventAppearanceSchema, async (input, ctx) => {
  await updateEventAppearance(ctx.actor, input);
  revalidate(input.eventId);
});

/** Step 1: a fresh cover key + a signed PUT the browser uploads to directly (D-A05). */
export const startCover = userAction(startCoverSchema, (input, ctx) =>
  startCoverUpload(privateStorage(), ctx.actor, input),
);

/** Step 2: verify size and magic bytes, then point the event at the new cover. */
export const completeCover = userAction(completeCoverSchema, async (input, ctx) => {
  const result = await completeCoverUpload(privateStorage(), ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const removeEventCover = userAction(eventIdSchema, async (input, ctx) => {
  await removeCover(privateStorage(), ctx.actor, input);
  revalidate(input.eventId);
});

/** EVT-10: HOST only; core blocks it once bookings or payments exist (P7/P8 hook). */
export const cancelThisEvent = userAction(eventIdSchema, async (input, ctx) => {
  await cancelEvent(ctx.actor, input);
  revalidate(input.eventId);
});
