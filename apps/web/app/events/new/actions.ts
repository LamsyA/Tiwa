'use server';

import {
  createEventDraft,
  createEventDraftSchema,
  eventIdSchema,
  finalizeEvent,
  saveEventStep,
  saveEventStepSchema,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';
import { runInline } from '@/lib/inline-jobs.js';

export const startEventDraft = userAction(createEventDraftSchema, (input, ctx) => createEventDraft(ctx.actor, input));

/** Autosave on Next (UF-03-2). */
export const saveWizardStep = userAction(saveEventStepSchema, (input, ctx) => saveEventStep(ctx.actor, input));

export const createEvent = userAction(eventIdSchema, async (input, ctx) => {
  const result = await finalizeEvent(ctx.actor, input);
  await runInline('event.finalized', { eventId: input.eventId });
  revalidatePath('/events');
  return result;
});
