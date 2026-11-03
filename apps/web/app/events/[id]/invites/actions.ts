'use server';

import { messageDrafterFromEnv } from '@tiwa/ai';
import { env } from '@tiwa/config';
import {
  createInviteBatch,
  createInviteBatchSchema,
  draftGuestMessage,
  draftGuestMessageSchema,
  estimateDraft,
  estimateDraftSchema,
  sendDraftedMessage,
  sendDraftedMessageSchema,
  enableInvites,
  enableInvitesSchema,
  markSentManually,
  markSentManuallySchema,
  revokeInvite,
  revokeInviteSchema,
  sendInviteBatch,
  sendInviteBatchSchema,
  setReminderPolicy,
  setReminderPolicySchema,
  toggleForwarding,
  toggleForwardingSchema,
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

export const setReminders = userAction(setReminderPolicySchema, async (input, ctx) => {
  const result = await setReminderPolicy(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const setForwarding = userAction(toggleForwardingSchema, async (input, ctx) => {
  const result = await toggleForwarding(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const revokeInviteAction = userAction(revokeInviteSchema, async (input, ctx) => {
  const result = await revokeInvite(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

/** One-prompt AI (D-X41): drafts and counts only — nothing is sent here (AI-06). */
export const draftAiMessageAction = userAction(draftGuestMessageSchema, async (input, ctx) =>
  draftGuestMessage(messageDrafterFromEnv(env), ctx.actor, input),
);

export const estimateAiMessageAction = userAction(estimateDraftSchema, async (input, ctx) =>
  estimateDraft(ctx.actor, input),
);

/** The host's one Send tap: sends exactly the reviewed text. */
export const sendAiMessageAction = userAction(sendDraftedMessageSchema, async (input, ctx) => {
  const result = await sendDraftedMessage(ctx.actor, input);
  await publishLive(`invites:${input.eventId}`, 'invites');
  revalidate(input.eventId);
  return result;
});
