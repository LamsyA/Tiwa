'use server';

import { env } from '@tiwa/config';
import { applyGuestChange, applyGuestChangeSchema, guestChangePreview, guestChangeSchema } from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

/** D-X84: what a new guest count changes, booking by booking (changes nothing). */
export const previewGuestChange = userAction(guestChangeSchema, (input, ctx) => guestChangePreview(ctx.actor, input));

/** D-X84: update the count, send each picked vendor its drafted change and a signed approve link. */
export const sendGuestChange = userAction(applyGuestChangeSchema, async (input, ctx) => {
  if (!env.AUTH_SECRET) throw new Error('AUTH_SECRET is not set');
  const result = await applyGuestChange(ctx.actor, input, env.AUTH_SECRET);
  revalidatePath(`/events/${input.eventId}`, 'layout');
  const base = env.APP_URL.replace(/\/$/, '');
  return {
    skipped: result.skipped,
    sent: result.sent.map(({ token, ...row }) => ({ ...row, url: `${base}/c/${token}` })),
    // D-X89: the planner gets a WhatsApp row too, pointing at the event's vendors page.
    planner: result.planner ? { ...result.planner, url: `${base}/events/${input.eventId}/vendors` } : null,
  };
});
