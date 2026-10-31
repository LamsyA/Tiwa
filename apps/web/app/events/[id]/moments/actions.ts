'use server';

import {
  blockUploader,
  blockUploaderSchema,
  listPendingMedia,
  moderateMediaItem,
  moderateMediaSchema,
  requestGalleryZip,
  resolveMediaReport,
  resolveReportSchema,
  rotateAccessCode,
  setGuestbookHidden,
  setGuestbookHiddenSchema,
  updateGallerySettings,
  updateGallerySettingsSchema,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { userAction } from '@/lib/ctx.js';
import { galleryChannel, publishLive } from '@/lib/live.js';
import { privateStorage } from '@/lib/storage.js';

function revalidate(eventId: string, galleryId?: string) {
  revalidatePath(`/events/${eventId}/moments`);
  if (galleryId) void publishLive(galleryChannel(galleryId), 'gallery');
}

export const saveMomentsSettings = userAction(updateGallerySettingsSchema, async (input, ctx) => {
  const result = await updateGallerySettings(ctx.actor, input);
  revalidate(input.eventId, result.galleryId);
  return result;
});

export const rotateMomentsCode = userAction(z.object({ eventId: z.string().uuid() }), async (input, ctx) => {
  const result = await rotateAccessCode(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const moderateMoment = userAction(moderateMediaSchema, async (input, ctx) => {
  const result = await moderateMediaItem(ctx.actor, input);
  revalidate(input.eventId, result.galleryId);
  return result;
});

const bulkSchema = z.object({
  eventId: z.string().uuid(),
  mediaIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['approve', 'hide', 'delete']),
});

export const bulkModerateMoments = userAction(bulkSchema, async (input, ctx) => {
  let galleryId: string | undefined;
  for (const mediaId of input.mediaIds) {
    const result = await moderateMediaItem(ctx.actor, { eventId: input.eventId, mediaId, action: input.action });
    galleryId = result.galleryId;
  }
  revalidate(input.eventId, galleryId);
  return { moderated: input.mediaIds.length };
});

export const blockMomentUploader = userAction(blockUploaderSchema, async (input, ctx) => {
  const result = await blockUploader(ctx.actor, input);
  revalidate(input.eventId, result.galleryId);
  return result;
});

export const requestMomentsZip = userAction(z.object({ eventId: z.string().uuid() }), async (input, ctx) => {
  const result = await requestGalleryZip(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const setMomentGuestbookHidden = userAction(setGuestbookHiddenSchema, async (input, ctx) => {
  const result = await setGuestbookHidden(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const resolveMomentReport = userAction(resolveReportSchema, async (input, ctx) => {
  const result = await resolveMediaReport(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

/** Cursor page for the review queue, with signed thumbnails for the client. */
export const morePendingMoments = userAction(
  z.object({ eventId: z.string().uuid(), cursor: z.string().max(200).optional() }),
  async (input, ctx) => {
    const page = await listPendingMedia(ctx.actor, input.eventId, {
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      limit: 60,
    });
    const storage = privateStorage();
    const items = await Promise.all(
      page.items.map(async (item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        thumbUrl: item.thumbKey ? await storage.getSignedUrl(item.thumbKey, 3600) : null,
        largeUrl: item.largeKey ? await storage.getSignedUrl(item.largeKey, 3600) : null,
      })),
    );
    return { items, nextCursor: page.nextCursor };
  },
);
