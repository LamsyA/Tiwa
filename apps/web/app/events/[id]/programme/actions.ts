'use server';

import { deleteProgrammeItem, deleteProgrammeItemSchema, programmeItemSchema, saveProgrammeItem } from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

/** D-X92: add or edit a programme item. */
export const saveProgrammeAction = userAction(programmeItemSchema, async (input, ctx) => {
  const result = await saveProgrammeItem(ctx.actor, input);
  revalidatePath(`/events/${input.eventId}/programme`);
  return result;
});

export const deleteProgrammeAction = userAction(deleteProgrammeItemSchema, async (input, ctx) => {
  await deleteProgrammeItem(ctx.actor, input);
  revalidatePath(`/events/${input.eventId}/programme`);
});
