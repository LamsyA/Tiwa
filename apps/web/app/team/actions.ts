'use server';

import { assignStaffToEvent, assignStaffSchema } from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

export const assignStaffAction = userAction(assignStaffSchema, async (input, ctx) => {
  const result = await assignStaffToEvent(ctx.actor, input);
  revalidatePath('/team');
  revalidatePath('/calendar');
  return { id: result.id };
});
