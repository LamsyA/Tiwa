'use server';

import {
  addGuests,
  addGuestsSchema,
  createGroup,
  createGroupSchema,
  deleteGroup,
  deleteGroupSchema,
  deleteGuests,
  deleteGuestsSchema,
  importCsvUploadSchema,
  listGroups,
  mergeGuests,
  mergeGuestsSchema,
  parseGuestPaste,
  requestCsvImport,
  requestCsvImportSchema,
  requireEventAccess,
  suggestCsvMapping,
  updateGroup,
  updateGroupSchema,
  updateGuest,
  updateGuestSchema,
  uuidv7,
} from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { userAction } from '@/lib/ctx.js';
import { eventChannel, publishLive } from '@/lib/live.js';
import { privateStorage } from '@/lib/storage.js';

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}`, 'layout');
}

async function notify(eventId: string) {
  await publishLive(eventChannel(eventId), 'guests');
  revalidate(eventId);
}

/** Paste preview: parse server-side (single source of truth, no libphonenumber in the client). */
export const previewPaste = userAction(
  z.object({ eventId: z.string().uuid(), text: z.string().max(200_000) }),
  async (input, ctx) => {
    await requireEventAccess(ctx.actor, input.eventId, 'guests.manage');
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: input.eventId },
      select: { countryCode: true },
    });
    return parseGuestPaste(input.text, event.countryCode).slice(0, 500);
  },
);

export const addGuestsAction = userAction(addGuestsSchema, async (input, ctx) => {
  const result = await addGuests(ctx.actor, input);
  await notify(input.eventId);
  return result;
});

export const editGuest = userAction(updateGuestSchema, async (input, ctx) => {
  await updateGuest(ctx.actor, input);
  await notify(input.eventId);
});

export const removeGuests = userAction(deleteGuestsSchema, async (input, ctx) => {
  const result = await deleteGuests(ctx.actor, input);
  await notify(input.eventId);
  return result;
});

export const mergeGuestsAction = userAction(mergeGuestsSchema, async (input, ctx) => {
  await mergeGuests(ctx.actor, input);
  await notify(input.eventId);
});

export const assignGroupsAction = userAction(
  z.object({
    eventId: z.string().uuid(),
    guestIds: z.array(z.string().uuid()).min(1).max(500),
    groupIds: z.array(z.string()).max(20),
  }),
  async (input, ctx) => {
    for (const guestId of input.guestIds) {
      await updateGuest(ctx.actor, { eventId: input.eventId, guestId, groupIds: input.groupIds });
    }
    await notify(input.eventId);
  },
);

export const createGroupAction = userAction(createGroupSchema, async (input, ctx) => {
  const result = await createGroup(ctx.actor, input);
  await notify(input.eventId);
  return result;
});

export const editGroup = userAction(updateGroupSchema, async (input, ctx) => {
  await updateGroup(ctx.actor, input);
  await notify(input.eventId);
});

export const removeGroup = userAction(deleteGroupSchema, async (input, ctx) => {
  await deleteGroup(ctx.actor, input);
  await notify(input.eventId);
});

export const listGroupsAction = userAction(z.object({ eventId: z.string().uuid() }), (input, ctx) =>
  listGroups(ctx.actor, input.eventId),
);

/** Header-only mapping suggestion for the CSV wizard. */
export const suggestMapping = userAction(
  z.object({ eventId: z.string().uuid(), header: z.array(z.string().max(120)).max(50) }),
  async (input, ctx) => {
    await requireEventAccess(ctx.actor, input.eventId, 'guests.manage');
    return suggestCsvMapping(input.header);
  },
);

/** Signed PUT for the raw CSV (private bucket; the worker deletes it after import). */
export const csvUploadUrl = userAction(importCsvUploadSchema, async (input, ctx) => {
  await requireEventAccess(ctx.actor, input.eventId, 'guests.manage');
  const key = `events/${input.eventId}/imports/${uuidv7()}.csv`;
  const uploadUrl = await privateStorage().signPut(key, 'text/csv', input.sizeBytes, 900);
  return { key, uploadUrl };
});

export const importCsv = userAction(requestCsvImportSchema, async (input, ctx) => {
  const result = await requestCsvImport(ctx.actor, input);
  await notify(input.eventId);
  return result;
});
