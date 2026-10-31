'use server';

import {
  archiveSpace,
  archiveSpaceSchema,
  blockAvailability,
  blockAvailabilitySchema,
  completeSpacePhoto,
  completeSpacePhotoSchema,
  removeSpacePhoto,
  removeSpacePhotoSchema,
  saveSpace,
  saveSpaceSchema,
  startSpacePhoto,
  startSpacePhotoSchema,
  unblockAvailability,
  unblockAvailabilitySchema,
  updateVenueSettings,
  updateVenueSettingsSchema,
} from '@tiwa/core';
import { revalidatePath, updateTag } from 'next/cache';
import { userAction } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';

/** P6-T08: venue space management (org ADMIN+ enforced in core). Spaces render
 * on the public profile, so edits also bust its `vendor:{orgId}` data cache. */
function refreshSpaces(orgId: string) {
  revalidatePath('/business/spaces');
  updateTag(`vendor:${orgId}`);
}

export const saveVenueSpace = userAction(saveSpaceSchema, async (input, ctx) => {
  const space = await saveSpace(ctx.actor, input);
  refreshSpaces(input.orgId);
  return { spaceId: space.id };
});

export const archiveVenueSpace = userAction(archiveSpaceSchema, async (input, ctx) => {
  await archiveSpace(ctx.actor, input);
  refreshSpaces(input.orgId);
});

export const saveVenueSettings = userAction(updateVenueSettingsSchema, async (input, ctx) => {
  await updateVenueSettings(ctx.actor, input);
  refreshSpaces(input.orgId);
});

export const startVenuePhoto = userAction(startSpacePhotoSchema, async (input, ctx) => {
  return startSpacePhoto(privateStorage(), ctx.actor, input);
});

export const completeVenuePhoto = userAction(completeSpacePhotoSchema, async (input, ctx) => {
  await completeSpacePhoto(privateStorage(), ctx.actor, input);
  refreshSpaces(input.orgId);
});

export const removeVenuePhoto = userAction(removeSpacePhotoSchema, async (input, ctx) => {
  await removeSpacePhoto(privateStorage(), ctx.actor, input);
  refreshSpaces(input.orgId);
});

export const blockSpaceDate = userAction(blockAvailabilitySchema, async (input, ctx) => {
  await blockAvailability(ctx.actor, input);
  refreshSpaces(input.orgId);
});

export const unblockSpaceDate = userAction(unblockAvailabilitySchema, async (input, ctx) => {
  await unblockAvailability(ctx.actor, input);
  refreshSpaces(input.orgId);
});
