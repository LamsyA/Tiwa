import { prisma } from '@tiwa/db';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';

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
