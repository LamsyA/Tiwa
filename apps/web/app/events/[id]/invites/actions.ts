'use server';

import { enableInvites, enableInvitesSchema, toggleSharedLink, toggleSharedLinkSchema } from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

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
