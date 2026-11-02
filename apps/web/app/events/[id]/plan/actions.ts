'use server';

import {
  applySuggestedTasks,
  applySuggestedTasksSchema,
  createTask,
  createTaskSchema,
  eventIdSchema,
  suggestedTasks,
  updateTask,
  updateTaskSchema,
} from '@tiwa/core';
import { userAction } from '@/lib/ctx.js';
import { eventChannel, publishLive } from '@/lib/live.js';

// Every change notifies other members over SSE (UF-05-3); their pages refetch.

export const addTask = userAction(createTaskSchema, async (input, ctx) => {
  const result = await createTask(ctx.actor, input);
  await publishLive(eventChannel(input.eventId), 'tasks');
  return result;
});

export const editTask = userAction(updateTaskSchema, async (input, ctx) => {
  const result = await updateTask(ctx.actor, input);
  await publishLive(eventChannel(input.eventId), 'tasks');
  return result;
});

/** Opt-in template suggestions (D-X30): list them, then add the ones the host picked. */
export const listSuggestionsAction = userAction(eventIdSchema, async (input, ctx) => suggestedTasks(ctx.actor, input));

export const applySuggestionsAction = userAction(applySuggestedTasksSchema, async (input, ctx) => {
  const result = await applySuggestedTasks(ctx.actor, input);
  await publishLive(eventChannel(input.eventId), 'tasks');
  return result;
});
