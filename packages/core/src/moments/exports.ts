import { z } from 'zod';
import { prisma } from '@tiwa/db';
import type { Actor, EventAccess } from '../auth/authorize.js';
import type { GalleryViewer } from './gallery-view.js';
import { getGalleryPage } from './gallery-view.js';
import { resolveEventAccess } from '../events/access.js';
import { NotFoundError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

// Takeout + guestbook (P5-T11). ZIP assembly runs in the worker
// (`media/zip`); the emailed link is the delivery channel.

async function galleryForEvent(eventId: string) {
  const gallery = await prisma.gallery.findUnique({ where: { eventId } });
  if (!gallery) throw new NotFoundError('Gallery not found', { eventId });
  return gallery;
}

async function requireModerator(actor: UserActor, eventId: string, preloaded?: EventAccess): Promise<void> {
  await resolveEventAccess(actor, eventId, 'moments.moderate', preloaded);
}

export async function requestGalleryZip(
  actor: UserActor,
  input: { eventId: string },
  preloaded?: EventAccess,
): Promise<{ zipId: string; status: string }> {
  await requireModerator(actor, input.eventId, preloaded);
  const gallery = await galleryForEvent(input.eventId);
  const fresh = await prisma.mediaZip.findFirst({
    where: { galleryId: gallery.id, status: 'PENDING', createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (fresh) return { zipId: fresh.id, status: 'PENDING' };
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.mediaZip.create({
      data: { galleryId: gallery.id, requestedByUserId: actor.userId },
      select: { id: true },
    });
    await enqueue(tx, 'media/zip', { zipId: created.id });
    await audit(tx, {
      actor,
      action: 'moments.requestZip',
      targetType: 'MediaZip',
      targetId: created.id,
      data: {},
    });
    return created;
  });
  return { zipId: row.id, status: 'PENDING' };
}

export interface GalleryZipStatus {
  id: string;
  status: 'PENDING' | 'READY' | 'FAILED';
  itemCount: number;
  sizeBytes: number | null;
  createdAt: Date;
  readyAt: Date | null;
  failReason: string | null;
}

export async function getLatestZip(
  actor: UserActor,
  eventId: string,
  preloaded?: EventAccess,
): Promise<GalleryZipStatus | null> {
  await requireModerator(actor, eventId, preloaded);
  const gallery = await galleryForEvent(eventId);
  const row = await prisma.mediaZip.findFirst({
    where: { galleryId: gallery.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    itemCount: row.itemCount,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    readyAt: row.readyAt,
    failReason: row.failReason,
  };
}

// ───────────── Guestbook ─────────────

export const postGuestbookSchema = z.object({
  code: z.string().min(4).max(16),
  name: z.string().trim().max(80).optional(),
  body: z.string().trim().min(1).max(500),
  access: z.string().trim().max(12).optional(),
});

export interface GuestbookEntry {
  id: string;
  name: string | null;
  body: string;
  createdAt: Date;
  hidden: boolean;
}

/** Public wall (MOM-14): newest first, hidden rows never leave the server. */
export async function listGuestbookMessages(
  galleryId: string,
  opts?: { limit?: number },
): Promise<{ messages: GuestbookEntry[] }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  const rows = await prisma.guestbookMessage.findMany({
    where: { galleryId, hidden: false },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return {
    messages: rows.map((row) => ({
      id: row.id,
      name: row.name,
      body: row.body,
      createdAt: row.createdAt,
      hidden: row.hidden,
    })),
  };
}

/** Full wall for hosts (hidden rows included for un-hide). */
export async function listGuestbookMessagesForHost(
  actor: UserActor,
  eventId: string,
  preloaded?: EventAccess,
): Promise<{ messages: GuestbookEntry[] }> {
  await requireModerator(actor, eventId, preloaded);
  const gallery = await galleryForEvent(eventId);
  const rows = await prisma.guestbookMessage.findMany({
    where: { galleryId: gallery.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return {
    messages: rows.map((row) => ({
      id: row.id,
      name: row.name,
      body: row.body,
      createdAt: row.createdAt,
      hidden: row.hidden,
    })),
  };
}

/**
 * Anyone who can open the gallery can sign the guestbook. The display name
 * is a free-text keepsake, not an identity claim — guests sign as themselves.
 */
export async function postGuestbookMessage(
  viewer: GalleryViewer,
  input: z.infer<typeof postGuestbookSchema> & { sessionIds?: string[] },
): Promise<{ messageId: string }> {
  const page = await getGalleryPage(input.code, viewer, {
    ...(input.access ? { accessCode: input.access } : {}),
    ...(input.sessionIds && input.sessionIds.length > 0 ? { sessionIds: input.sessionIds } : {}),
  });
  const created = await prisma.guestbookMessage.create({
    data: {
      galleryId: page.gallery.id,
      name: input.name?.trim().slice(0, 80) || null,
      body: input.body.trim(),
    },
    select: { id: true },
  });
  return { messageId: created.id };
}

export const setGuestbookHiddenSchema = z.object({
  eventId: z.string().uuid(),
  messageId: z.string().uuid(),
  hidden: z.boolean(),
});

/** Hosts hide (or restore) wall entries; nothing is ever deleted. */
export async function setGuestbookHidden(
  actor: UserActor,
  input: z.infer<typeof setGuestbookHiddenSchema>,
  preloaded?: EventAccess,
): Promise<{ hidden: boolean }> {
  await requireModerator(actor, input.eventId, preloaded);
  const gallery = await galleryForEvent(input.eventId);
  const message = await prisma.guestbookMessage.findUnique({ where: { id: input.messageId } });
  if (!message || message.galleryId !== gallery.id) throw new NotFoundError('Message not found', {});
  await prisma.$transaction(async (tx) => {
    await tx.guestbookMessage.update({ where: { id: message.id }, data: { hidden: input.hidden } });
    await audit(tx, {
      actor,
      action: input.hidden ? 'moments.hideGuestbook' : 'moments.unhideGuestbook',
      targetType: 'GuestbookMessage',
      targetId: message.id,
      data: {},
    });
  });
  return { hidden: input.hidden };
}
