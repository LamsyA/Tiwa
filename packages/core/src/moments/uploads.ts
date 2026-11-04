import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma, type Prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit, enqueue } from '../shared/outbox.js';
import type { Storage } from '@tiwa/storage';
import { capUpload } from '../shared/upload-limit.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
export interface GallerySessionActor {
  kind: 'gallery-session';
  sessionId: string;
  galleryId: string;
}
export type UploaderActor = UserActor | GallerySessionActor;

// Upload limits (MOM-03/04, Frontend §7.4): images resize client-side, videos cap by plan.
export const IMAGE_MAX_BYTES = capUpload(25 * 1024 * 1024);
export const VIDEO_MAX_BYTES = capUpload(200 * 1024 * 1024);
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
  return name.replace(/[^a-zA-Z0-9.-]+/g, '_').slice(0, 120) || 'file';
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
 * gallery limits, then mints the MediaItem row in UPLOADING state and returns
 * its storage key. The client drives the S3 protocol itself afterwards via
 * /api/uploads/sign (used with @uppy/aws-s3 `signRequest`); the server
 * never sees the bytes. The row id is embedded in the key so signing can
 * resolve the upload without extra client state.
 */
export async function createUpload(
  actor: UploaderActor,
  input: z.infer<typeof createUploadSchema>,
  preloaded?: EventAccess,
): Promise<{ mediaId: string; key: string }> {
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

  const mediaId = uuidv7();
  const key = `galleries/${gallery.id}/originals/${mediaId}/${sanitizeFileName(input.fileName)}`;
  await prisma.$transaction(async (tx) => {
    await tx.mediaItem.create({
      data: {
        id: mediaId,
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
    });
    await audit(tx, {
      actor: actor.kind === 'user' ? actor : { kind: 'guest', guestId: actor.sessionId, eventId: input.eventId },
      action: 'moments.createUpload',
      targetType: 'MediaItem',
      targetId: mediaId,
      data: { kind: input.kind },
    });
  });
  return { mediaId, key };
}

export const signUploadSchema = z.object({
  /** S3-shaped signing request, as @uppy/aws-s3 sends it. */
  key: z.string().min(1).max(500),
  method: z.enum(['PUT', 'POST', 'DELETE', 'GET']),
  uploadId: z.string().max(200).optional(),
  partNumber: z.number().int().min(1).max(MAX_PART_NUMBER).optional(),
});

async function loadOwnUpload(actor: UploaderActor, mediaId: string) {
  const item = await prisma.mediaItem.findUnique({ where: { id: mediaId }, include: { gallery: true } });
  if (!item || item.deletedAt) throw new NotFoundError('Upload not found', { mediaId });
  if (actor.kind === 'gallery-session') {
    if (item.uploaderSessionId !== actor.sessionId || item.galleryId !== actor.galleryId) {
      throw new ForbiddenError('Not your upload', {});
    }
  } else if (item.uploaderUserId !== actor.userId) {
    // Hosts/photographers may finish uploads they started from another device.
    await resolveEventAccess(actor, item.gallery.eventId, 'moments.upload.official');
  }
  return item;
}

/**
 * Sign one step of the browser-driven S3 multipart protocol (used with
 * @uppy/aws-s3 `signRequest`). The mediaId is recovered from the key path
 * (`galleries/{galleryId}/originals/{mediaId}/{file}`), and the row's own
 * stored key is what gets signed — never the client-supplied one — so a
 * signed URL can never point anywhere else. Create calls carry no uploadId
 * yet; every other op requires the S3 id Uppy parsed from the create
 * response. Abandoned multipart uploads on the bucket expire via the bucket
 * lifecycle rule (R2 default 7 days).
 */
export async function signS3Upload(
  storage: Storage,
  actor: UploaderActor,
  input: z.infer<typeof signUploadSchema>,
): Promise<{ url: string }> {
  const segments = input.key.split('/');
  const mediaId =
    segments.length === 5 && segments[0] === 'galleries' && segments[2] === 'originals' ? segments[3] : undefined;
  if (!mediaId) throw new NotFoundError('Upload not found', { key: 'unknownKey' });
  const item = await loadOwnUpload(actor, mediaId);
  if (item.state !== 'UPLOADING') throw new ValidationError('Upload is not open', { key: 'notOpen' });
  if (item.originalKey !== input.key) throw new ForbiddenError('Key mismatch', { key: 'keyMismatch' });
  const key = item.originalKey;
  switch (input.method) {
    case 'POST':
      if (input.uploadId) return { url: await storage.signCompleteMultipart(key, input.uploadId) };
      return { url: await storage.signCreateMultipart(key) };
    case 'PUT':
      if (input.partNumber === undefined) throw new ValidationError('Missing part number', { key: 'missingPart' });
      if (!input.uploadId) throw new ValidationError('Missing upload id', { key: 'missingUploadId' });
      return { url: await storage.signPart(key, input.uploadId, input.partNumber) };
    case 'DELETE':
      if (!input.uploadId) throw new ValidationError('Missing upload id', { key: 'missingUploadId' });
      return { url: await storage.signAbortMultipart(key, input.uploadId) };
    case 'GET':
      if (!input.uploadId) throw new ValidationError('Missing upload id', { key: 'missingUploadId' });
      return { url: await storage.signListParts(key, input.uploadId) };
  }
}

export const completeUploadSchema = z.object({
  mediaId: z.string().uuid(),
});

/** Mark the upload complete: verify the object exists, move to PROCESSING and enqueue the worker. */
export async function completeUpload(
  storage: Storage,
  actor: UploaderActor,
  input: z.infer<typeof completeUploadSchema>,
): Promise<{ mediaId: string }> {
  const item = await loadOwnUpload(actor, input.mediaId);
  if (item.state !== 'UPLOADING') throw new ValidationError('Upload is not open', { key: 'notOpen' });
  const head = await storage.head(item.originalKey);
  if (!head) throw new ValidationError('Upload is empty', { key: 'emptyUpload' });
  const result = await prisma.$transaction(async (tx) => {
    await tx.mediaItem.update({
      where: { id: item.id },
      data: { state: 'PROCESSING', sizeBytes: head.sizeBytes },
    });
    await enqueue(tx, item.kind === 'PHOTO' ? 'media/process-image' : 'media/process-video', {
      mediaItemId: item.id,
    });
    await audit(tx, {
      actor: actor.kind === 'user' ? actor : { kind: 'guest', guestId: actor.sessionId, eventId: item.gallery.eventId },
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
});

/**
 * Drop an UPLOADING row (the browser aborts the S3 multipart itself first via
 * a signed URL). Orphaned S3 parts expire via the bucket lifecycle rule.
 */
export async function abortUpload(
  actor: UploaderActor,
  input: z.infer<typeof abortUploadSchema>,
): Promise<{ aborted: true }> {
  const item = await loadOwnUpload(actor, input.mediaId);
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
