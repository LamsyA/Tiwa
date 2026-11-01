'use server';

import {
  addBookEntryToEvent,
  addBookEntryToEventSchema,
  addToVendorBook,
  addVendorBookSchema,
  removeVendorBookEntry,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { userAction } from '@/lib/ctx.js';

export const addVendorBookAction = userAction(addVendorBookSchema, async (input, ctx) => {
  const result = await addToVendorBook(ctx.actor, input);
  revalidatePath('/vendor-book');
  return { id: result.id };
});

export const removeVendorBookAction = userAction(z.object({ entryId: z.string().uuid() }), async (input, ctx) => {
  await removeVendorBookEntry(ctx.actor, input.entryId);
  revalidatePath('/vendor-book');
  return { deleted: true };
});

export const addBookEntryToEventAction = userAction(addBookEntryToEventSchema, async (input, ctx) => {
  const result = await addBookEntryToEvent(ctx.actor, input);
  revalidatePath('/vendor-book');
  return { id: result.id };
});
