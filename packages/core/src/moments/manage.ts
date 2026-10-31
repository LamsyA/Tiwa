import { z } from 'zod';
import { prisma, type Prisma } from '@tiwa/db';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { shortCode } from '../shared/ids.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

// Host moderation (P5-T08, UF-11). Guests manage only their own rows
// (gallery-view.ts); everything here needs `moments.moderate`.

export const updateGallerySettingsSchema = z.object({
  eventId: z.string().uuid(),
  privacy: z.enum(['GUESTS_ONLY', 'LINK', 'PUBLIC']).optional(),
  moderation: z.enum(['INSTANT', 'APPROVE_FIRST']).optional(),
  slideshowDelaySec: z.number().int().min(5).max(300).optional(),
  guestDownloads: z.boolean().optional(),
  showFooter: z.boolean().optional(),
});

async function galleryForEvent(eventId: string) {
  const gallery = await prisma.gallery.findUnique({ where: { eventId } });
  if (!gallery) throw new NotFoundError('Gallery not found', { eventId });
  return gallery;
}

async function requireModerator(actor: UserActor, eventId: string, preloaded?: EventAccess): Promise<void> {
  await resolveEventAccess(actor, eventId, 'moments.moderate', preloaded);
}

export async function updateGallerySettings(
  actor: UserActor,
  input: z.infer<typeof updateGallerySettingsSchema>,
  preloaded?: EventAccess,
): Promise<{ galleryId: string }> {
  await requireModerator(actor, input.eventId, preloaded);
  const gallery = await galleryForEvent(input.eventId);
  // Hiding the "Planned with Tiwa" footer is a Plus perk (P5-T12); free
  // galleries always carry it. Entitlements arrive with P8 payments.
  if (input.showFooter === false && gallery.plan !== 'PLUS') {
    throw new ValidationError('Hiding the footer needs Moments Plus', { key: 'plusOnly' });
  }
  // exactOptionalPropertyTypes: only defined fields reach Prisma; undefined
  // values are not assignable to GalleryUpdateInput.
  const data: Prisma.GalleryUpdateInput = {};
  if (input.privacy !== undefined) data.privacy = input.privacy;
  if (input.moderation !== undefined) data.moderation = input.moderation;
  if (input.slideshowDelaySec !== undefined) data.slideshowDelaySec = input.slideshowDelaySec;
  if (input.guestDownloads !== undefined) data.guestDownloads = input.guestDownloads;
  if (input.showFooter !== undefined) data.showFooter = input.showFooter;
  if (Object.keys(data).length === 0) throw new ValidationError('Nothing to update', { key: 'empty' });
  // Audit takes plain JSON (ids/enums only): rebuild without undefined so it
  // satisfies the JsonObject type.
  const auditData: Record<string, string | number | boolean> = {};
  if (input.privacy !== undefined) auditData.privacy = input.privacy;
  if (input.moderation !== undefined) auditData.moderation = input.moderation;
  if (input.slideshowDelaySec !== undefined) auditData.slideshowDelaySec = input.slideshowDelaySec;
  if (input.guestDownloads !== undefined) auditData.guestDownloads = input.guestDownloads;
  if (input.showFooter !== undefined) auditData.showFooter = input.showFooter;
  await prisma.$transaction(async (tx) => {
    await tx.gallery.update({ where: { id: gallery.id }, data });
    await audit(tx, {
      actor,
      action: 'moments.updateSettings',
      targetType: 'Gallery',
      targetId: gallery.id,
      data: auditData,
    });
  });
  return { galleryId: gallery.id };
}

/** New printed access code for GUESTS_ONLY galleries (QR cards, T08). */
export async function rotateAccessCode(
  actor: UserActor,
  input: { eventId: string },
  preloaded?: EventAccess,
): Promise<{ accessCode: string }> {
  await requireModerator(actor, input.eventId, preloaded);
  const gallery = await galleryForEvent(input.eventId);
  const accessCode = shortCode(6);
  await prisma.$transaction(async (tx) => {
    await tx.gallery.update({ where: { id: gallery.id }, data: { accessCode } });
    await audit(tx, {
      actor,
      action: 'moments.rotateAccessCode',
      targetType: 'Gallery',
      targetId: gallery.id,
      data: {},
    });
  });
  return { accessCode };
}

export interface MomentsDashboard {
  gallery: {
    id: string;
    code: string;
    privacy: 'GUESTS_ONLY' | 'LINK' | 'PUBLIC';
    moderation: 'INSTANT' | 'APPROVE_FIRST';
    slideshowDelaySec: number;
    guestDownloads: boolean;
    showFooter: boolean;
    accessCode: string | null;
    plan: 'FREE' | 'PLUS';
    itemLimit: number;
    expiresAt: Date | null;
    daysLeft: number | null;
  };
  counts: { total: number; published: number; pending: number; hidden: number; reported: number; uploaders: number };
  lastZip: {
    id: string;
    status: 'PENDING' | 'READY' | 'FAILED';
    itemCount: number;
    sizeBytes: number | null;
    createdAt: Date;
    readyAt: Date | null;
  } | null;
}

export async function getMomentsDashboard(
  actor: UserActor,
  eventId: string,
  preloaded?: EventAccess,
): Promise<MomentsDashboard> {
  await requireModerator(actor, eventId, preloaded);
  const gallery = await galleryForEvent(eventId);
  const [total, published, pending, hidden, sessions, users] = await Promise.all([
    prisma.mediaItem.count({ where: { galleryId: gallery.id, deletedAt: null, state: { not: 'BLOCKED' } } }),
    prisma.mediaItem.count({ where: { galleryId: gallery.id, deletedAt: null, state: 'PUBLISHED' } }),
    prisma.mediaItem.count({ where: { galleryId: gallery.id, deletedAt: null, state: 'PENDING_REVIEW' } }),
    prisma.mediaItem.count({ where: { galleryId: gallery.id, deletedAt: null, state: 'HIDDEN' } }),
    prisma.mediaItem.findMany({
      where: { galleryId: gallery.id, deletedAt: null, uploaderSessionId: { not: null } },
      select: { uploaderSessionId: true },
      distinct: ['uploaderSessionId'],
    }),
    prisma.mediaItem.findMany({
      where: { galleryId: gallery.id, deletedAt: null, uploaderUserId: { not: null } },
      select: { uploaderUserId: true },
      distinct: ['uploaderUserId'],
    }),
  ]);
  const openReports = await prisma.report.findMany({
    where: { status: 'OPEN', targetType: 'media' },
    select: { targetId: true },
  });
  const lastZipRow = await prisma.mediaZip.findFirst({
    where: { galleryId: gallery.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, itemCount: true, sizeBytes: true, createdAt: true, readyAt: true },
  });
  const itemIds = new Set(
    (await prisma.mediaItem.findMany({ where: { galleryId: gallery.id }, select: { id: true } })).map((row) => row.id),
  );
  return {
    gallery: {
      id: gallery.id,
      code: gallery.code,
      privacy: gallery.privacy,
      moderation: gallery.moderation,
      slideshowDelaySec: gallery.slideshowDelaySec,
      guestDownloads: gallery.guestDownloads,
      showFooter: gallery.showFooter,
      accessCode: gallery.accessCode,
      plan: gallery.plan === 'PLUS' ? 'PLUS' : 'FREE',
      itemLimit: gallery.itemLimit,
      expiresAt: gallery.expiresAt,
      daysLeft: gallery.expiresAt ? Math.ceil((gallery.expiresAt.getTime() - Date.now()) / 86400000) : null,
    },
    counts: {
      total,
      published,
      pending,
      hidden,
      reported: openReports.filter((report) => itemIds.has(report.targetId)).length,
      uploaders: sessions.length + users.length,
    },
    lastZip: lastZipRow
      ? {
          id: lastZipRow.id,
          status: lastZipRow.status,
          itemCount: lastZipRow.itemCount,
          sizeBytes: lastZipRow.sizeBytes,
          createdAt: lastZipRow.createdAt,
          readyAt: lastZipRow.readyAt,
        }
      : null,
  };
}

export interface PendingMediaItem {
  id: string;
  album: 'OFFICIAL' | 'GUEST';
  kind: 'PHOTO' | 'VIDEO';
  thumbKey: string | null;
  largeKey: string | null;
  posterKey: string | null;
  createdAt: Date;
  uploaderLabel: string;
  uploaderSessionId: string | null;
  featured: boolean;
}

/** Review queue (UF-11): oldest pending first so nothing waits forever. */
export async function listPendingMedia(
  actor: UserActor,
  eventId: string,
  opts?: { cursor?: string; limit?: number },
  preloaded?: EventAccess,
): Promise<{ items: PendingMediaItem[]; nextCursor: string | null }> {
  await requireModerator(actor, eventId, preloaded);
  const gallery = await galleryForEvent(eventId);
  const limit = Math.min(Math.max(opts?.limit ?? 60, 1), 100);
  const where: Prisma.MediaItemWhereInput = { galleryId: gallery.id, deletedAt: null, state: 'PENDING_REVIEW' };
  if (opts?.cursor) {
    const [iso, id] = opts.cursor.split('|');
    const at = new Date(iso ?? '');
    if (!Number.isNaN(at.getTime()) && id)
      where.OR = [{ createdAt: { gt: at } }, { createdAt: { equals: at }, id: { gt: id } }];
  }
  const rows = await prisma.mediaItem.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const sessionIds = page.map((row) => row.uploaderSessionId).filter((id): id is string => id !== null);
  const userIds = page.map((row) => row.uploaderUserId).filter((id): id is string => id !== null);
  const [sessions, users] = await Promise.all([
    prisma.guestSession.findMany({ where: { id: { in: sessionIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const sessionById = new Map(sessions.map((session) => [session.id, session.name] as const));
  const userById = new Map(users.map((user) => [user.id, user.name] as const));
  const last = page[page.length - 1];
  const labelFor = (row: (typeof page)[number]): string => {
    if (row.uploaderSessionId) return sessionById.get(row.uploaderSessionId) ?? 'Guest';
    if (row.uploaderUserId) return userById.get(row.uploaderUserId) ?? 'Member';
    return 'Guest';
  };
  return {
    items: page.map((row) => ({
      id: row.id,
      album: row.album,
      kind: row.kind,
      thumbKey: row.thumbKey,
      largeKey: row.largeKey,
      posterKey: row.posterKey,
      createdAt: row.createdAt,
      uploaderLabel: labelFor(row),
      uploaderSessionId: row.uploaderSessionId,
      featured: row.featured,
    })),
    nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

export interface PublishedMediaItem extends PendingMediaItem {
  state: 'PUBLISHED';
}

/**
 * Live gallery management (UF-11-1): newest published first, both albums.
 * Hosts hide/feature/delete/block from here; approvals live on the pending tab.
 */
export async function listPublishedMedia(
  actor: UserActor,
  eventId: string,
  opts?: { cursor?: string; limit?: number },
  preloaded?: EventAccess,
): Promise<{ items: PublishedMediaItem[]; nextCursor: string | null }> {
  await requireModerator(actor, eventId, preloaded);
  const gallery = await galleryForEvent(eventId);
  const limit = Math.min(Math.max(opts?.limit ?? 60, 1), 100);
  const where: Prisma.MediaItemWhereInput = { galleryId: gallery.id, deletedAt: null, state: 'PUBLISHED' };
  if (opts?.cursor) {
    const [iso, id] = opts.cursor.split('|');
    const at = new Date(iso ?? '');
    if (!Number.isNaN(at.getTime()) && id)
      where.OR = [{ createdAt: { lt: at } }, { createdAt: { equals: at }, id: { lt: id } }];
  }
  const rows = await prisma.mediaItem.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const sessionIds = page.map((row) => row.uploaderSessionId).filter((id): id is string => id !== null);
  const userIds = page.map((row) => row.uploaderUserId).filter((id): id is string => id !== null);
  const [sessions, users] = await Promise.all([
    prisma.guestSession.findMany({ where: { id: { in: sessionIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const sessionById = new Map(sessions.map((session) => [session.id, session.name] as const));
  const userById = new Map(users.map((user) => [user.id, user.name] as const));
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id,
      album: row.album,
      kind: row.kind,
      thumbKey: row.thumbKey,
      largeKey: row.largeKey,
      posterKey: row.posterKey,
      createdAt: row.createdAt,
      uploaderLabel:
        row.uploaderSessionId != null
          ? (sessionById.get(row.uploaderSessionId) ?? 'Guest')
          : row.uploaderUserId != null
            ? (userById.get(row.uploaderUserId) ?? 'Member')
            : 'Guest',
      uploaderSessionId: row.uploaderSessionId,
      featured: row.featured,
      state: 'PUBLISHED' as const,
    })),
    nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

export interface OpenMediaReport {
  id: string;
  reason: string;
  createdAt: Date;
  reporterLabel: string;
  item: {
    id: string;
    album: 'OFFICIAL' | 'GUEST';
    kind: 'PHOTO' | 'VIDEO';
    thumbKey: string | null;
    largeKey: string | null;
    state: string;
    createdAt: Date;
    uploaderLabel: string;
    uploaderSessionId: string | null;
    featured: boolean;
  } | null;
}

export async function listOpenMediaReports(
  actor: UserActor,
  eventId: string,
  preloaded?: EventAccess,
): Promise<{ reports: OpenMediaReport[] }> {
  await requireModerator(actor, eventId, preloaded);
  const gallery = await galleryForEvent(eventId);
  const itemIds = new Set(
    (await prisma.mediaItem.findMany({ where: { galleryId: gallery.id }, select: { id: true } })).map((row) => row.id),
  );
  const reports = await prisma.report.findMany({
    where: { status: 'OPEN', targetType: 'media', targetId: { in: [...itemIds] } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  const items = await prisma.mediaItem.findMany({
    where: { id: { in: reports.map((report) => report.targetId) } },
    select: {
      id: true,
      album: true,
      kind: true,
      thumbKey: true,
      largeKey: true,
      state: true,
      createdAt: true,
      uploaderSessionId: true,
      uploaderUserId: true,
      featured: true,
    },
  });
  const sessionIds = [
    ...reports.map((report) => report.reporterSessionId),
    ...items.map((item) => item.uploaderSessionId),
  ].filter((id): id is string => id !== null);
  const userIds = [
    ...reports.map((report) => report.reporterUserId),
    ...items.map((item) => item.uploaderUserId),
  ].filter((id): id is string => id !== null);
  const [sessions, users] = await Promise.all([
    prisma.guestSession.findMany({ where: { id: { in: sessionIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const sessionById = new Map(sessions.map((session) => [session.id, session.name] as const));
  const userById = new Map(users.map((user) => [user.id, user.name] as const));
  const uploaderLabelFor = (row: (typeof items)[number]): string => {
    if (row.uploaderSessionId) return sessionById.get(row.uploaderSessionId) ?? 'Guest';
    if (row.uploaderUserId) return userById.get(row.uploaderUserId) ?? 'Member';
    return 'Guest';
  };
  return {
    reports: reports.map((report) => {
      const item = itemById.get(report.targetId) ?? null;
      const reporterLabel = report.reporterSessionId
        ? (sessionById.get(report.reporterSessionId) ?? 'Guest')
        : report.reporterUserId
          ? (userById.get(report.reporterUserId) ?? 'Member')
          : 'Anonymous';
      return {
        id: report.id,
        reason: report.reason,
        createdAt: report.createdAt,
        reporterLabel,
        item: item
          ? {
              id: item.id,
              album: item.album,
              kind: item.kind,
              thumbKey: item.thumbKey,
              largeKey: item.largeKey,
              state: item.state,
              createdAt: item.createdAt,
              uploaderLabel: uploaderLabelFor(item),
              uploaderSessionId: item.uploaderSessionId,
              featured: item.featured,
            }
          : null,
      };
    }),
  };
}

export const moderateMediaSchema = z.object({
  eventId: z.string().uuid(),
  mediaId: z.string().uuid(),
  action: z.enum(['approve', 'hide', 'unhide', 'feature', 'unfeature', 'delete']),
});

const ACTION_LABEL: Record<z.infer<typeof moderateMediaSchema>['action'], string> = {
  approve: 'moments.approveMedia',
  hide: 'moments.hideMedia',
  unhide: 'moments.unhideMedia',
  feature: 'moments.featureMedia',
  unfeature: 'moments.unfeatureMedia',
  delete: 'moments.deleteMedia',
};

/**
 * One host action per item (UF-11-1): approve → PUBLISHED, hide/unhide,
 * feature toggle, soft delete. Approvals are idempotent (double taps are
 * free); BLOCKED rows are safety-owned and never touched here.
 */
export async function moderateMediaItem(
  actor: UserActor,
  input: z.infer<typeof moderateMediaSchema>,
  preloaded?: EventAccess,
): Promise<{ galleryId: string; state: string; featured: boolean; deleted: boolean }> {
  await requireModerator(actor, input.eventId, preloaded);
  const gallery = await galleryForEvent(input.eventId);
  const item = await prisma.mediaItem.findUnique({ where: { id: input.mediaId } });
  if (!item || item.galleryId !== gallery.id || item.deletedAt) throw new NotFoundError('Photo not found', {});
  if (item.state === 'BLOCKED') throw new ForbiddenError('Blocked photos stay hidden', { key: 'blocked' });

  let state = item.state;
  let featured = item.featured;
  let deleted = false;
  switch (input.action) {
    case 'approve':
      if (item.state === 'PENDING_REVIEW' || item.state === 'HIDDEN' || item.state === 'PUBLISHED') state = 'PUBLISHED';
      else throw new ValidationError('Only pending or hidden photos can be approved', { key: 'badState' });
      break;
    case 'hide':
      // BLOCKED already throws above, so hiding always applies.
      state = 'HIDDEN';
      break;
    case 'unhide':
      if (item.state === 'HIDDEN') state = 'PUBLISHED';
      else throw new ValidationError('Only hidden photos can be unhidden', { key: 'badState' });
      break;
    case 'feature':
      featured = true;
      break;
    case 'unfeature':
      featured = false;
      break;
    case 'delete':
      deleted = true;
      break;
  }
  await prisma.$transaction(async (tx) => {
    if (deleted) {
      await tx.mediaItem.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    } else if (state !== item.state || featured !== item.featured) {
      await tx.mediaItem.update({ where: { id: item.id }, data: { state, featured } });
    }
    // Publishing an official photo queues the © watermark (P5-T10); the job
    // skips anything already marked, so double approves are harmless.
    if (input.action === 'approve' && state === 'PUBLISHED' && item.album === 'OFFICIAL' && !item.watermarked) {
      await enqueue(tx, 'media/watermark', { mediaItemId: item.id });
    }
    await audit(tx, {
      actor,
      action: ACTION_LABEL[input.action],
      targetType: 'MediaItem',
      targetId: item.id,
      data: { from: item.state, to: deleted ? 'DELETED' : state },
    });
  });
  return { galleryId: gallery.id, state: deleted ? item.state : state, featured, deleted };
}

export const blockUploaderSchema = z.object({ eventId: z.string().uuid(), mediaId: z.string().uuid() });

/**
 * Block the guest behind one item (UF-11): the session can never upload
 * again and every visible item they uploaded is hidden in the same
 * transaction. Member uploads only get hidden (accounts aren't blocked here).
 */
export async function blockUploader(
  actor: UserActor,
  input: z.infer<typeof blockUploaderSchema>,
  preloaded?: EventAccess,
): Promise<{ galleryId: string; blocked: boolean; hiddenCount: number }> {
  await requireModerator(actor, input.eventId, preloaded);
  const gallery = await galleryForEvent(input.eventId);
  const item = await prisma.mediaItem.findUnique({ where: { id: input.mediaId } });
  if (!item || item.galleryId !== gallery.id || item.deletedAt) throw new NotFoundError('Photo not found', {});

  const sessionId = item.uploaderSessionId;
  const target =
    sessionId != null
      ? { uploaderSessionId: sessionId }
      : item.uploaderUserId != null
        ? { uploaderUserId: item.uploaderUserId }
        : null;
  if (!target) throw new ValidationError('Uploader is unknown', { key: 'unknownUploader' });

  const hidden = await prisma.$transaction(async (tx) => {
    if (sessionId) {
      await tx.guestSession.updateMany({
        where: { id: sessionId, galleryId: gallery.id },
        data: { blockedAt: new Date() },
      });
    }
    const result = await tx.mediaItem.updateMany({
      where: {
        galleryId: gallery.id,
        deletedAt: null,
        state: { in: ['PUBLISHED', 'PENDING_REVIEW', 'HIDDEN'] },
        ...target,
      },
      data: { state: 'HIDDEN' },
    });
    await audit(tx, {
      actor,
      action: 'moments.blockUploader',
      targetType: 'MediaItem',
      targetId: item.id,
      data: { sessionBlocked: sessionId !== null, hiddenCount: result.count },
    });
    return result.count;
  });
  return { galleryId: gallery.id, blocked: sessionId !== null, hiddenCount: hidden };
}

export const resolveReportSchema = z.object({ eventId: z.string().uuid(), reportId: z.string().uuid() });

/** Close a removal request after acting on the item (T08 review queue). */
export async function resolveMediaReport(
  actor: UserActor,
  input: z.infer<typeof resolveReportSchema>,
  preloaded?: EventAccess,
): Promise<{ resolved: true }> {
  await requireModerator(actor, input.eventId, preloaded);
  const gallery = await galleryForEvent(input.eventId);
  const report = await prisma.report.findUnique({ where: { id: input.reportId } });
  if (!report || report.status !== 'OPEN' || report.targetType !== 'media') {
    throw new NotFoundError('Report not found', {});
  }
  const item = report.targetId
    ? await prisma.mediaItem.findUnique({ where: { id: report.targetId }, select: { galleryId: true } })
    : null;
  if (!item || item.galleryId !== gallery.id) throw new NotFoundError('Report not found', {});
  await prisma.$transaction(async (tx) => {
    await tx.report.update({ where: { id: report.id }, data: { status: 'RESOLVED' } });
    await audit(tx, { actor, action: 'moments.resolveReport', targetType: 'Report', targetId: report.id, data: {} });
  });
  return { resolved: true };
}
