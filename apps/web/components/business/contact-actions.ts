'use server';

import { businessContactSchema, updateBusinessContact } from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

/** D-X90: save the business phone and email (owner/admin). */
export const saveBusinessContact = userAction(businessContactSchema, async (input, ctx) => {
  await updateBusinessContact(ctx.actor, input);
  revalidatePath('/', 'layout');
});
