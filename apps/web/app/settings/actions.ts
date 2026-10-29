'use server';

import {
  deleteAccountSchema,
  deleteMyAccount,
  requestDataExport,
  updateProfile,
  updateProfileSchema,
} from '@tiwa/core';
import { THEME_COOKIE } from '@tiwa/ui/theme';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { action, userAction } from '@/lib/ctx.js';

export const saveProfile = userAction(updateProfileSchema, async (input, ctx) => {
  await updateProfile(ctx.actor.userId, input);
  revalidatePath('/settings');
});

/** Theme lives in a cookie so the server renders it with no flash (Frontend.md §2); works signed out too. */
export const saveTheme = action(z.object({ theme: z.enum(['light', 'dark', 'system']) }), async (input) => {
  (await cookies()).set(THEME_COOKIE, input.theme, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
});

export const exportMyData = userAction(z.object({}), async (_input, ctx) => {
  const result = await requestDataExport(ctx.actor.userId);
  return { repeat: result.repeat };
});

export const deleteAccount = userAction(deleteAccountSchema, async (_input, ctx) => {
  await deleteMyAccount(ctx.actor.userId);
  // Sessions are gone server-side; drop the browser's cookies too.
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (cookie.name.includes('better-auth')) store.delete(cookie.name);
  }
});
