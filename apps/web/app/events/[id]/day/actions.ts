'use server';

import {
  addDependency,
  createFromProgramme,
  createRunItem,
  createRunItemSchema,
  deleteRunItem,
  deleteRunItemSchema,
  dependencySchema,
  removeDependency,
  updateRunItem,
  updateRunItemSchema,
  updateRunStatus,
  updateRunStatusSchema,
} from '@tiwa/core';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/day`);
}

const fromProgrammeSchema = z.object({ eventId: z.string().uuid() });

export const createItemAction = userAction(createRunItemSchema, async (input, ctx) => {
  const result = await createRunItem(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const updateItemAction = userAction(updateRunItemSchema, async (input, ctx) => {
  const result = await updateRunItem(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const deleteItemAction = userAction(deleteRunItemSchema, async (input, ctx) => {
  const result = await deleteRunItem(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const fromProgrammeAction = userAction(fromProgrammeSchema, async (input, ctx) => {
  const result = await createFromProgramme(ctx.actor, input.eventId);
  revalidate(input.eventId);
  return result;
});

export const addDepAction = userAction(dependencySchema, async (input, ctx) => {
  const result = await addDependency(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const removeDepAction = userAction(dependencySchema, async (input, ctx) => {
  const result = await removeDependency(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const updateStatusAction = userAction(updateRunStatusSchema, async (input, ctx) => {
  const result = await updateRunStatus(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});
