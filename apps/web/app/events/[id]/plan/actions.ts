'use server';

import { planDrafterFromEnv } from '@tiwa/ai';
import { env } from '@tiwa/config';
import {
  addDraftedTasks,
  addDraftedTasksSchema,
  createTask,
  createTaskSchema,
  deleteTask,
  deleteTaskSchema,
  draftPlan,
  draftPlanSchema,
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

export const removeTask = userAction(deleteTaskSchema, async (input, ctx) => {
  const result = await deleteTask(ctx.actor, input);
  await publishLive(eventChannel(input.eventId), 'tasks');
  return result;
});

/** AI plan assistant (D-X31): suggestions only — nothing is saved here (AI-06). */
export const draftPlanAction = userAction(draftPlanSchema, async (input, ctx) =>
  draftPlan(planDrafterFromEnv(env), ctx.actor, input),
);

export const addDraftedTasksAction = userAction(addDraftedTasksSchema, async (input, ctx) => {
  const result = await addDraftedTasks(ctx.actor, input);
  await publishLive(eventChannel(input.eventId), 'tasks');
  return result;
});
