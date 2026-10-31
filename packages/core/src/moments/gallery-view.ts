import { z } from 'zod';
import { prisma } from '@tiwa/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Public gallery reads (P5-T06, UF-10). Guests see PUBLISHED items only;
// BLOCKED / HIDDEN / FAILED rows never leave the server on this path.
// (The host moderation queue in T08 gets its own query.)

export type GalleryViewer =
  | { kind: 'user'; userId: string; isAdmin: boolean }
  | { kind: 'gallery-session'; sessionId: string }
  | { kind: 'anonymous' };

export interface GalleryHeader {
  id: string;
  code: string;
  privacy: 'GUESTS_ONLY' | 'LINK' | 'PUBLIC';
  moderation: 'INSTANT' | 'APPROVE_FIRST';
  slideshowDelaySec: number;
  guestDownloads: boolean;
  showFooter: boolean;
}

export interface GalleryEventInfo {
  id: string;
  name: string;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  coverKey: string | null;
  status: string;
}

export interface GalleryPage {
  gallery: GalleryHeader;
  event: GalleryEventInfo;
  counts: { official: number; guest: number };
  isMember: boolean;
  sessionId: string | null;
}

const PUBLIC_STATES = ['PUBLISHED'] as const;

async function loadGallery(code: string) {
  const gallery = await prisma.gallery.findUnique({
    where: { code },
    include: { event: true },
  });
  if (!gallery || !gallery.event.momentsEnabled) throw new NotFoundError('Gallery not found', {});
  return gallery;
}

async function isEventMember(userId: string, eventId: string): Promise<boolean> {
  const row = await prisma.eventParticipant.findFirst({
    where: { eventId, userId, removedAt: null },
    select: { id: true },
  });
  return row !== null;
}

async function sessionBelongsToGallery(sessionId: string, galleryId: string): Promise<boolean> {
  const session = await prisma.guestSession.findUnique({
    where: { id: sessionId },
    select: { galleryId: true, blockedAt: true },
  });
  return session !== null && session.galleryId === galleryId && session.blockedAt === null;
}

/**
 * Privacy gate for `/m/{code}` (Frontend §6.2, UF-10 edge cases).
 * LINK and PUBLIC open with the code alone; GUESTS_ONLY needs a member,
 * a live guest session for this gallery, or the printed access code.
 */
export async function getGalleryPage(
  code: string,
  viewer: GalleryViewer,
  opts?: { accessCode?: string; sessionIds?: string[] },
): Promise<GalleryPage> {
  const gallery = await loadGallery(code);
  const event = gallery.event;

  let isMember = false;
  let sessionId: string | null = null;
  if (viewer.kind === 'user') {
    isMember = viewer.isAdmin || (await isEventMember(viewer.userId, event.id));
  }
  if (viewer.kind === 'gallery-session') {
    if (await sessionBelongsToGallery(viewer.sessionId, gallery.id)) sessionId = viewer.sessionId;
  }
  for (const candidate of opts?.sessionIds ?? []) {
    if (sessionId) break;
    if (await sessionBelongsToGallery(candidate, gallery.id)) sessionId = candidate;
  }

  if (gallery.privacy === 'GUESTS_ONLY' && !isMember && !sessionId) {
    const access = (opts?.accessCode ?? '').trim().toUpperCase();
    if (!access || !gallery.accessCode || access !== gallery.accessCode.toUpperCase()) {
      throw new ForbiddenError('Gallery is for guests only', { key: 'guestsOnly' });
    }
  }

  const [official, guest] = await Promise.all([
    prisma.mediaItem.count({ where: { galleryId: gallery.id, album: 'OFFICIAL', state: { in: [...PUBLIC_STATES] } } }),
    prisma.mediaItem.count({ where: { galleryId: gallery.id, album: 'GUEST', state: { in: [...PUBLIC_STATES] } } }),
  ]);

  return {
    gallery: {
      id: gallery.id,
      code: gallery.code,
      privacy: gallery.privacy,
      moderation: gallery.moderation,
      slideshowDelaySec: gallery.slideshowDelaySec,
      guestDownloads: gallery.guestDownloads,
      showFooter: gallery.showFooter,
    },
    event: {
      id: event.id,
      name: event.name,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      coverKey: event.coverKey,
      status: event.status,
    },
    counts: { official, guest },
    isMember,
    sessionId,
  };
}

export interface GalleryMediaItem {
  id: string;
  album: 'OFFICIAL' | 'GUEST';
  kind: 'PHOTO' | 'VIDEO';
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
  thumbKey: string | null;
  largeKey: string | null;
  posterKey: string | null;
  featured: boolean;
  createdAt: Date;
  mine: boolean;
}

export interface GalleryMediaPage {
  items: GalleryMediaItem[];
  nextCursor: string | null;
}

const PAGE_SIZES = { default: 60, max: 100 } as const;

function cursorWhere(cursor: string | undefined, galleryId: string, album: 'OFFICIAL' | 'GUEST') {
  // Cursor is `${createdAtISO}_${id}`; pages newest-first with a tie-break on id.
  if (!cursor) return { galleryId, album, state: { in: [...PUBLIC_STATES] } };
  const sep = cursor.lastIndexOf('_');
  const at = new Date(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (Number.isNaN(at.getTime()) || !id) return { galleryId, album, state: { in: [...PUBLIC_STATES] } };
  return {
    galleryId,
    album,
    state: { in: [...PUBLIC_STATES] },
    OR: [{ createdAt: { lt: at } }, { createdAt: { equals: at }, id: { lt: id } }],
  };
}

/**
 * Newest-first media window for one album. Callers must run the privacy gate
 * (`getGalleryPage`) first — this only filters to published rows and marks
 * the viewer's own uploads for the "My uploads" filter (UF-10-6).
 */
export async function listGalleryMedia(
  galleryId: string,
  viewer: GalleryViewer,
  opts: { album: 'OFFICIAL' | 'GUEST'; cursor?: string; limit?: number },
): Promise<GalleryMediaPage> {
  const limit = Math.min(Math.max(opts.limit ?? PAGE_SIZES.default, 1), PAGE_SIZES.max);
  const rows = await prisma.mediaItem.findMany({
    where: cursorWhere(opts.cursor, galleryId, opts.album),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      album: true,
      kind: true,
      width: true,
      height: true,
      blurDataUrl: true,
      thumbKey: true,
      largeKey: true,
      posterKey: true,
      featured: true,
      createdAt: true,
      uploaderUserId: true,
      uploaderSessionId: true,
    },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id,
      album: row.album,
      kind: row.kind,
      width: row.width,
      height: row.height,
      blurDataUrl: row.blurDataUrl,
      thumbKey: row.thumbKey,
      largeKey: row.largeKey,
      posterKey: row.posterKey,
      featured: row.featured,
      createdAt: row.createdAt,
      mine:
        (viewer.kind === 'user' && row.uploaderUserId === viewer.userId) ||
        (viewer.kind === 'gallery-session' && row.uploaderSessionId === viewer.sessionId),
    })),
    nextCursor: hasMore && last ? `${last.createdAt.toISOString()}_${last.id}` : null,
  };
}

// ───────────── Upload sheet (P5-T07) ─────────────

export async function galleryCodeForEvent(eventId: string): Promise<string | null> {
  const gallery = await prisma.gallery.findUnique({ where: { eventId }, select: { code: true } });
  return gallery?.code ?? null;
}

export interface ClaimedSession {
  galleryId: string;
  galleryCode: string;
  sessionId: string;
  guestName: string;
}

/**
 * Invite-link handoff (UF-08 → UF-10): the pass page links
 * `/m/{code}?guest={inviteToken}`. A valid, unrevoked invite mints a gallery
 * session named after the guest, so invite holders skip the access code and
 * the name form. The session cookie set from this is what later uploads and
 * "My uploads" are keyed on.
 */
export async function claimGallerySessionFromInvite(inviteToken: string): Promise<ClaimedSession> {
  const guest = await prisma.guest.findUnique({
    where: { inviteToken },
    select: { id: true, name: true, eventId: true, inviteRevokedAt: true },
  });
  if (!guest || guest.inviteRevokedAt) throw new NotFoundError('Invitation is not valid', {});
  const gallery = await prisma.gallery.findUnique({ where: { eventId: guest.eventId } });
  if (!gallery) throw new NotFoundError('Gallery not found', {});
  const session = await prisma.guestSession.create({
    data: { galleryId: gallery.id, name: guest.name.slice(0, 80) },
    select: { id: true },
  });
  return { galleryId: gallery.id, galleryCode: gallery.code, sessionId: session.id, guestName: guest.name };
}

function guestActor(sessionId: string, eventId: string) {
  return { kind: 'guest' as const, guestId: sessionId, eventId };
}

async function loadDeletableItem(viewer: GalleryViewer, sessionIds: string[], mediaId: string) {
  const item = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    include: { gallery: { select: { id: true, eventId: true } } },
  });
  if (!item || item.deletedAt) throw new NotFoundError('Photo not found', {});
  const owned =
    (viewer.kind === 'user' && item.uploaderUserId === viewer.userId) ||
    (viewer.kind === 'gallery-session' && item.uploaderSessionId === viewer.sessionId) ||
    (item.uploaderSessionId !== null && sessionIds.includes(item.uploaderSessionId));
  if (!owned) throw new ForbiddenError('You can only delete your own uploads', { key: 'notOwner' });
  return item;
}

/**
 * Guests delete their own uploads (UF-10, MOM-17). Soft delete only; the
 * worker purges originals later (P5-T12). Host moderation of other people's
 * items lives in T08.
 */
export async function deleteOwnMedia(
  viewer: GalleryViewer,
  input: { mediaId: string; sessionIds?: string[] },
): Promise<{ deleted: true }> {
  const item = await loadDeletableItem(viewer, input.sessionIds ?? [], input.mediaId);
  await prisma.$transaction(async (tx) => {
    await tx.mediaItem.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    await audit(tx, {
      actor:
        viewer.kind === 'user'
          ? viewer
          : guestActor(
              viewer.kind === 'gallery-session' ? viewer.sessionId : (input.sessionIds?.[0] ?? 'unknown'),
              item.gallery.eventId,
            ),
      action: 'moments.deleteOwnMedia',
      targetType: 'MediaItem',
      targetId: item.id,
      data: {},
    });
  });
  return { deleted: true };
}

export const requestRemovalSchema = z.object({
  mediaId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
});

/**
 * Anyone can request removal of a photo of themselves (MOM-17). Creates a
 * Report for the host moderation queue (T08); the item stays visible until
 * a host acts.
 */
export async function requestMediaRemoval(
  viewer: GalleryViewer,
  input: z.infer<typeof requestRemovalSchema> & { sessionIds?: string[] },
): Promise<{ reportId: string }> {
  const item = await prisma.mediaItem.findUnique({
    where: { id: input.mediaId },
    include: { gallery: { select: { id: true, eventId: true } } },
  });
  if (!item || item.deletedAt) throw new NotFoundError('Photo not found', {});
  if (item.state === 'BLOCKED') throw new ValidationError('Photo is already hidden', { key: 'alreadyHidden' });
  const reporterUserId = viewer.kind === 'user' ? viewer.userId : null;
  const reporterSessionId = viewer.kind === 'gallery-session' ? viewer.sessionId : (input.sessionIds?.[0] ?? null);
  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: {
        targetType: 'media',
        targetId: item.id,
        reason: input.reason?.trim() || 'Removal requested by a person in the photo',
        ...(reporterUserId ? { reporterUserId } : {}),
        ...(reporterSessionId ? { reporterSessionId } : {}),
      },
      select: { id: true },
    });
    await audit(tx, {
      actor: viewer.kind === 'user' ? viewer : guestActor(reporterSessionId ?? 'unknown', item.gallery.eventId),
      action: 'moments.requestRemoval',
      targetType: 'MediaItem',
      targetId: item.id,
      data: { reportId: created.id },
    });
    return created;
  });
  return { reportId: report.id };
}

export interface SlideshowItem {
  id: string;
  kind: 'PHOTO' | 'VIDEO';
  width: number | null;
  height: number | null;
  durationSec: number | null;
  thumbKey: string | null;
  largeKey: string | null;
  posterKey: string | null;
  featured: boolean;
  createdAt: Date;
}

/**
 * Slideshow feed (P5-T09, UF-12): featured photos first, then newest.
 * Published rows only; the page re-polls so host moderation lands within
 * seconds (UF-11-1). Caller runs the privacy gate (`getGalleryPage`) first.
 */
export async function listSlideshowFeed(
  galleryId: string,
  opts?: { limit?: number },
): Promise<{ items: SlideshowItem[] }> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);
  const rows = await prisma.mediaItem.findMany({
    where: { galleryId, state: 'PUBLISHED', deletedAt: null },
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      kind: true,
      width: true,
      height: true,
      durationSec: true,
      thumbKey: true,
      largeKey: true,
      posterKey: true,
      featured: true,
      createdAt: true,
    },
  });
  return { items: rows };
}
