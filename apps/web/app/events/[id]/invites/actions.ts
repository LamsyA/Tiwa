'use server';

import {
  createInviteBatch,
  createInviteBatchSchema,
  enableInvites,
  enableInvitesSchema,
  markSentManually,
  markSentManuallySchema,
  sendInviteBatch,
  sendInviteBatchSchema,
  toggleSharedLink,
  toggleSharedLinkSchema,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';
import { publishLive } from '@/lib/live.js';

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}`, 'layout');
}

export const setInvitesEnabled = userAction(enableInvitesSchema, async (input, ctx) => {
  const result = await enableInvites(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const setSharedLink = userAction(toggleSharedLinkSchema, async (input, ctx) => {
  const result = await toggleSharedLink(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const createBatchAction = userAction(createInviteBatchSchema, async (input, ctx) => {
  const result = await createInviteBatch(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const sendBatchAction = userAction(sendInviteBatchSchema, async (input, ctx) => {
  const result = await sendInviteBatch(ctx.actor, input);
  return result;
});

export const markSentManuallyAction = userAction(markSentManuallySchema, async (input, ctx) => {
  const result = await markSentManually(ctx.actor, input);
  await publishLive(`invites:${result.eventId}`, 'invites');
  revalidate(result.eventId);
  return result;
});
