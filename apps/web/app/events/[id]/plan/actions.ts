'use server';

import { createTask, createTaskSchema, updateTask, updateTaskSchema } from '@tiwa/core';
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
