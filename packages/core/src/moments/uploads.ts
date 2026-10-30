import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma, type Prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { generateToken } from '../shared/ids.js';
import { audit, enqueue } from '../shared/outbox.js';
import type { Storage } from '@tiwa/storage';

type UserActor = Extract<Actor, { kind: 'user' }>;
export interface GallerySessionActor {
  kind: 'gallery-session';
  sessionId: string;
  galleryId: string;
}
export type UploaderActor = UserActor | GallerySessionActor;

// Upload limits (MOM-03/04, Frontend §7.4): images resize client-side, videos cap by plan.
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const VIDEO_FREE_SEC = 30;
export const VIDEO_PLUS_SEC = 3 * 60;
export const MAX_PART_NUMBER = 10_000;

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export const createUploadSchema = z.object({
  eventId: z.string().uuid(),
  album: z.enum(['OFFICIAL', 'GUEST']),
  fileName: z.string().trim().min(1).max(255),
  mime: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1),
  kind: z.enum(['PHOTO', 'VIDEO']),
  durationSec: z.number().int().min(0).max(3600).optional(),
});

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

async function galleryForEvent(eventId: string) {
  const gallery = await prisma.gallery.findUnique({
    where: { eventId },
    include: { event: { select: { status: true, momentsEnabled: true, countryCode: true } } },
  });
  if (!gallery) throw new NotFoundError('Gallery not found', { eventId });
  return gallery;
}

async function authorizeUpload(
  actor: UploaderActor,
  eventId: string,
  album: 'OFFICIAL' | 'GUEST',
  preloaded?: EventAccess,
): Promise<void> {
  if (actor.kind === 'gallery-session') {
    if (album !== 'GUEST') throw new ForbiddenError('Guests upload to the guest album only', { album });
    return;
  }
  await resolveEventAccess(
    actor,
    eventId,
    album === 'OFFICIAL' ? 'moments.upload.official' : 'moments.upload.guest',
    preloaded,
  );
}

/**
 * Start a browser-direct multipart upload (arc §5). Validates type, size and
 * gallery limits, creates the MediaItem in UPLOADING state and opens the MPU.
 */
export async function createUpload(
  storage: Storage,
  actor: UploaderActor,
  input: z.infer<typeof createUploadSchema>,
  preloaded?: EventAccess,
): Promise<{ mediaId: string; uploadId: string; key: string }> {
  const gallery = await galleryForEvent(input.eventId);
  if (actor.kind === 'gallery-session') {
    if (actor.galleryId !== gallery.id) throw new ForbiddenError('Session does not belong to this gallery', {});
    const session = await prisma.guestSession.findUnique({ where: { id: actor.sessionId } });
    if (!session || session.galleryId !== gallery.id || session.blockedAt) {
      throw new ForbiddenError('Guest session is not allowed to upload', {});
    }
    if (!gallery.event.momentsEnabled) throw new ForbiddenError('Moments is off for this event', {});
  }
  await authorizeUpload(actor, input.eventId, input.album, preloaded);

  const allowed = input.kind === 'PHOTO' ? IMAGE_MIMES : VIDEO_MIMES;
  if (!(allowed as readonly string[]).includes(input.mime)) {
    throw new ValidationError('Unsupported file type', { field: 'mime', key: 'unsupportedType' });
  }
  const maxBytes = input.kind === 'PHOTO' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (input.sizeBytes > maxBytes) throw new ValidationError('File too large', { field: 'sizeBytes', key: 'tooLarge' });

  const live = await prisma.mediaItem.count({ where: { galleryId: gallery.id, deletedAt: null } });
  if (live >= gallery.itemLimit) throw new ValidationError('Gallery is full', { key: 'galleryFull' });

  const key = `galleries/${gallery.id}/originals/${generateToken(16)}/${sanitizeFileName(input.fileName)}`;
  const { uploadId } = await storage.createMultipart(key, input.mime);
  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: input.album,
        uploaderUserId: actor.kind === 'user' ? actor.userId : null,
        uploaderSessionId: actor.kind === 'gallery-session' ? actor.sessionId : null,
        kind: input.kind,
        state: 'UPLOADING',
        originalKey: key,
        sizeBytes: input.sizeBytes,
        durationSec: input.kind === 'VIDEO' && input.durationSec !== undefined ? input.durationSec : null,
      },
      select: { id: true },
    });
    await audit(tx, {
      actor: actor.kind === 'user' ? actor : { kind: 'guest', guestId: actor.sessionId, eventId: input.eventId },
      action: 'moments.createUpload',
      targetType: 'MediaItem',
      targetId: item.id,
      data: { kind: input.kind },
    });
    return item;
  });
  return { mediaId: created.id, uploadId, key };
}

export const signPartSchema = z.object({
  mediaId: z.string().uuid(),
  uploadId: z.string().min(1).max(200),
  partNumber: z.number().int().min(1).max(MAX_PART_NUMBER),
});

async function loadOwnUpload(actor: UploaderActor, mediaId: string) {
  const item = await prisma.mediaItem.findUnique({ where: { id: mediaId }, include: { gallery: true } });
  if (!item || item.deletedAt) throw new NotFoundError('Upload not found', { mediaId });
  if (actor.kind === 'gallery-session') {
    if (item.uploaderSessionId !== actor.sessionId || item.galleryId !== actor.galleryId) {
      throw new ForbiddenError('Not your upload', {});
    }
  } else {
    if (item.uploaderUserId !== actor.userId) {
      // Hosts/photographers may finish uploads they started from another device.
      await resolveEventAccess(actor, item.gallery.eventId, 'moments.upload.official');
    }
  }
  return item;
}

/** Pre-signed URL for one 5 MB part (browser PUTs straight to storage). */
export async function signPart(
  storage: Storage,
  actor: UploaderActor,
  input: z.infer<typeof signPartSchema>,
): Promise<{ url: string }> {
  const item = await loadOwnUpload(actor, input.mediaId);
  if (item.state !== 'UPLOADING') throw new ValidationError('Upload is not open', { key: 'notOpen' });
  // The browser returns the uploadId from createUpload on every part call —
  // rows never store it, so leaked ids can't resurrect finished uploads.
  return { url: await storage.signPart(item.originalKey, input.uploadId, input.partNumber) };
}

export const completeUploadSchema = z.object({
  mediaId: z.string().uuid(),
  uploadId: z.string().min(1).max(200),
  parts: z
    .array(z.object({ eTag: z.string().min(1), partNumber: z.number().int().min(1).max(MAX_PART_NUMBER) }))
    .min(1)
    .max(MAX_PART_NUMBER),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
});

/** Finish the MPU, verify the object exists, move to PROCESSING and enqueue the worker. */
export async function completeUpload(
  storage: Storage,
  actor: UploaderActor,
  input: z.infer<typeof completeUploadSchema>,
): Promise<{ mediaId: string }> {
  const item = await loadOwnUpload(actor, input.mediaId);
  if (item.state !== 'UPLOADING') throw new ValidationError('Upload is not open', { key: 'notOpen' });
  await storage.completeMultipart(item.originalKey, input.uploadId, input.parts);
  const head = await storage.head(item.originalKey);
  if (!head) throw new ValidationError('Upload is empty', { key: 'emptyUpload' });
  const result = await prisma.$transaction(async (tx) => {
    await tx.mediaItem.update({
      where: { id: item.id },
      data: {
        state: 'PROCESSING',
        sizeBytes: head.sizeBytes,
        ...(input.sha256 !== undefined ? { sha256: input.sha256 } : {}),
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
      },
    });
    await enqueue(tx, item.kind === 'PHOTO' ? 'media/process-image' : 'media/process-video', {
      mediaItemId: item.id,
    });
    await audit(tx, {
      actor:
        actor.kind === 'user' ? actor : { kind: 'guest', guestId: actor.sessionId, eventId: item.gallery.eventId },
      action: 'moments.completeUpload',
      targetType: 'MediaItem',
      targetId: item.id,
      data: {},
    });
    return { mediaId: item.id };
  });
  return result;
}

export const abortUploadSchema = z.object({
  mediaId: z.string().uuid(),
  uploadId: z.string().min(1).max(200),
});

/** Abort the MPU and drop the UPLOADING row (nothing was ever published). */
export async function abortUpload(
  storage: Storage,
  actor: UploaderActor,
  input: z.infer<typeof abortUploadSchema>,
): Promise<{ aborted: true }> {
  const item = await loadOwnUpload(actor, input.mediaId);
  await storage.abortMultipart(item.originalKey, input.uploadId).catch(() => undefined);
  await prisma.mediaItem.deleteMany({ where: { id: item.id, state: 'UPLOADING' } });
  return { aborted: true };
}

// ───────────── Guest sessions ─────────────
// Cookie name: tiwa_gs_{galleryId}; value: `${sessionId}.${sig}` (HMAC, AUTH_SECRET).

export function guestSessionCookieName(galleryId: string): string {
  return `tiwa_gs_${galleryId}`;
}

export function signGuestSession(sessionId: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(`guest-session-v1:${sessionId}`, 'utf8').digest('base64url');
  return `${sessionId}.${sig}`;
}

export function verifyGuestSessionCookie(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const sessionId = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(`guest-session-v1:${sessionId}`, 'utf8').digest();
  const actual = Buffer.from(sig, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return sessionId;
}

export async function createGuestSession(
  tx: Prisma.TransactionClient,
  galleryId: string,
  name?: string,
): Promise<{ sessionId: string }> {
  const session = await tx.guestSession.create({ data: { galleryId, name: name?.trim() || null } });
  return { sessionId: session.id };
}
