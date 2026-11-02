'use server';

import {
  addDependency,
  createContact,
  createContactSchema,
  createFromProgramme,
  createRunItem,
  createRunItemSchema,
  deleteContact,
  deleteContactSchema,
  deleteRunItem,
  deleteRunItemSchema,
  dependencySchema,
  logIncident,
  logIncidentSchema,
  markLate,
  markLateSchema,
  removeDependency,
  resolveIncident,
  resolveIncidentSchema,
  updateRunItem,
  updateRunItemSchema,
  updateRunStatus,
  updateRunStatusSchema,
} from '@tiwa/core';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';
import { dayChannel, publishLive } from '@/lib/live.js';

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/day`);
}

async function announce(eventId: string) {
  await publishLive(dayChannel(eventId), 'day');
  revalidate(eventId);
}

const fromProgrammeSchema = z.object({ eventId: z.string().uuid() });

export const createItemAction = userAction(createRunItemSchema, async (input, ctx) => {
  const result = await createRunItem(ctx.actor, input);
  await announce(input.eventId);
  return result;
});

export const updateItemAction = userAction(updateRunItemSchema, async (input, ctx) => {
  const result = await updateRunItem(ctx.actor, input);
  await announce(input.eventId);
  return result;
});

export const deleteItemAction = userAction(deleteRunItemSchema, async (input, ctx) => {
  const result = await deleteRunItem(ctx.actor, input);
  await announce(input.eventId);
  return result;
});

export const fromProgrammeAction = userAction(fromProgrammeSchema, async (input, ctx) => {
  const result = await createFromProgramme(ctx.actor, input.eventId);
  await announce(input.eventId);
  return result;
});

export const addDepAction = userAction(dependencySchema, async (input, ctx) => {
  const result = await addDependency(ctx.actor, input);
  await announce(input.eventId);
  return result;
});

export const removeDepAction = userAction(dependencySchema, async (input, ctx) => {
  const result = await removeDependency(ctx.actor, input);
  await announce(input.eventId);
  return result;
});

export const updateStatusAction = userAction(updateRunStatusSchema, async (input, ctx) => {
  const result = await updateRunStatus(ctx.actor, input);
  await announce(input.eventId);
  return result;
});

export const markLateAction = userAction(markLateSchema, async (input, ctx) => {
  const result = await markLate(ctx.actor, input);
  await announce(input.eventId);
  return result;
});

export const logIncidentAction = userAction(logIncidentSchema, async (input, ctx) => {
  const result = await logIncident(ctx.actor, input);
  await announce(input.eventId);
  return result;
});

export const resolveIncidentAction = userAction(resolveIncidentSchema, async (input, ctx) => {
  const result = await resolveIncident(ctx.actor, input);
  await announce(input.eventId);
  return result;
});

export const createContactAction = userAction(createContactSchema, async (input, ctx) => {
  const result = await createContact(ctx.actor, input);
  await announce(input.eventId);
  return result;
});

export const deleteContactAction = userAction(deleteContactSchema, async (input, ctx) => {
  const result = await deleteContact(ctx.actor, input);
  await announce(input.eventId);
  return result;
});
