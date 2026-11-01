'use server';

import {
  addParticipant,
  addParticipantSchema,
  removeParticipant,
  removeParticipantSchema,
  updateParticipant,
  updateParticipantSchema,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';
import { runInline } from '@/lib/inline-jobs.js';
import { notifyEventInvite } from '@/lib/invite-notify.js';

export const addEventMember = userAction(addParticipantSchema, async (input, ctx) => {
  const invite = await addParticipant(ctx.actor, input);
  await runInline('event.members.changed', { eventId: input.eventId });
  const { sent } = await notifyEventInvite(invite);
  revalidatePath(`/events/${input.eventId}`, 'layout');
  return { sent };
});

export const updateEventMember = userAction(updateParticipantSchema, async (input, ctx) => {
  await updateParticipant(ctx.actor, input);
  revalidatePath(`/events/${input.eventId}`, 'layout');
});

export const removeEventMember = userAction(removeParticipantSchema, async (input, ctx) => {
  await removeParticipant(ctx.actor, input);
  await runInline('event.members.changed', { eventId: input.eventId });
  revalidatePath(`/events/${input.eventId}`, 'layout');
});
