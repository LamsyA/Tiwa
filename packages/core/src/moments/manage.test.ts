import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { ensureGallery } from './galleries.js';
import { createGuestSession } from './uploads.js';
import {
  blockUploader,
  getMomentsDashboard,
  listOpenMediaReports,
  listPendingMedia,
  moderateMediaItem,
  resolveMediaReport,
  rotateAccessCode,
  updateGallerySettings,
} from './manage.js';
import { requestMediaRemoval } from './gallery-view.js';

const users: string[] = [];
const events: string[] = [];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function eventWithGallery(moderation: 'INSTANT' | 'APPROVE_FIRST' = 'APPROVE_FIRST') {
  const host = await makeHost();
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  events.push(eventId);
  await prisma.event.update({ where: { id: eventId }, data: { startsAt: new Date('2031-03-01T15:00:00Z') } });
  await prisma.$transaction((tx) => ensureGallery(tx, eventId));
  const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId } });
  await prisma.gallery.update({ where: { id: gallery.id }, data: { moderation } });
  return { host, eventId, gallery };
}

async function seedPending(galleryId: string, sessionId: string, n = 3) {
  return Promise.all(
    Array.from({ length: n }, (_, i) =>
      prisma.mediaItem.create({
        data: {
          galleryId,
          album: 'GUEST',
          kind: 'PHOTO',
          state: 'PENDING_REVIEW',
          originalKey: `g/${galleryId}/p${i}.jpg`,
          thumbKey: `g/${galleryId}/t${i}.jpg`,
          sizeBytes: 10,
          uploaderSessionId: sessionId,
        },
        select: { id: true },
      }),
    ),
  );
}

afterAll(async () => {
  const galleryIds = (await prisma.gallery.findMany({ where: { eventId: { in: events } }, select: { id: true } })).map(
    (row) => row.id,
  );
  const mediaIds = (
    await prisma.mediaItem.findMany({ where: { galleryId: { in: galleryIds } }, select: { id: true } })
  ).map((row) => row.id);
  await prisma.report.deleteMany({ where: { targetId: { in: mediaIds } } });
  await prisma.outboxEvent.deleteMany({ where: { topic: 'media/watermark' } });
  await prisma.mediaItem.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestbookMessage.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestSession.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.gallery.deleteMany({ where: { eventId: { in: events } } });
  await prisma.task.deleteMany({ where: { eventId: { in: events } } });
  await prisma.programmeItem.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventDay.deleteMany({ where: { eventId: { in: events } } });
  await prisma.budgetCategory.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('updateGallerySettings + rotateAccessCode', () => {
  it('updates settings with audit and rejects empty updates and strangers', async () => {
    const { host, eventId, gallery } = await eventWithGallery();
    await updateGallerySettings(host, { eventId, moderation: 'INSTANT', slideshowDelaySec: 45 });
    expect((await prisma.gallery.findUniqueOrThrow({ where: { id: gallery.id } })).moderation).toBe('INSTANT');
    await expect(updateGallerySettings(host, { eventId })).rejects.toThrow(/Nothing to update/i);
    const stranger = await makeHost();
    await expect(updateGallerySettings(stranger, { eventId, moderation: 'INSTANT' })).rejects.toThrow();
    const before = (await prisma.gallery.findUniqueOrThrow({ where: { id: gallery.id } })).accessCode;
    const { accessCode } = await rotateAccessCode(host, { eventId });
    expect(accessCode).not.toBe(before);
    expect(accessCode).toHaveLength(6);
  });
});

describe('moderateMediaItem', () => {
  it('approves pending rows idempotently, hides, features and deletes', async () => {
    const { host, eventId, gallery } = await eventWithGallery();
    const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, gallery.id, 'Ada'));
    const [item] = await seedPending(gallery.id, sessionId, 1);
    if (!item) throw new Error('no item');

    await expect(moderateMediaItem(host, { eventId, mediaId: item.id, action: 'approve' })).resolves.toMatchObject({
      state: 'PUBLISHED',
    });
    // Idempotent second approve.
    await expect(moderateMediaItem(host, { eventId, mediaId: item.id, action: 'approve' })).resolves.toMatchObject({
      state: 'PUBLISHED',
    });
    await expect(moderateMediaItem(host, { eventId, mediaId: item.id, action: 'feature' })).resolves.toMatchObject({
      featured: true,
    });
    await expect(moderateMediaItem(host, { eventId, mediaId: item.id, action: 'hide' })).resolves.toMatchObject({
      state: 'HIDDEN',
    });
    await expect(moderateMediaItem(host, { eventId, mediaId: item.id, action: 'unhide' })).resolves.toMatchObject({
      state: 'PUBLISHED',
    });
    await expect(moderateMediaItem(host, { eventId, mediaId: item.id, action: 'delete' })).resolves.toMatchObject({
      deleted: true,
    });
    expect((await prisma.mediaItem.findUniqueOrThrow({ where: { id: item.id } })).deletedAt).not.toBeNull();

    // BLOCKED rows are safety-owned.
    const blocked = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'BLOCKED',
        originalKey: `g/${gallery.id}/b.jpg`,
        sizeBytes: 10,
      },
    });
    await expect(moderateMediaItem(host, { eventId, mediaId: blocked.id, action: 'approve' })).rejects.toThrow(
      /Blocked/i,
    );
    const stranger = await makeHost();
    await expect(moderateMediaItem(stranger, { eventId, mediaId: blocked.id, action: 'hide' })).rejects.toThrow();
  });

  it('queues a watermark job when an official photo is published', async () => {
    const { host, eventId, gallery } = await eventWithGallery();
    const official = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'OFFICIAL',
        kind: 'PHOTO',
        state: 'PENDING_REVIEW',
        originalKey: `g/${gallery.id}/wm.jpg`,
        largeKey: `g/${gallery.id}/l.jpg`,
        sizeBytes: 10,
      },
    });
    await moderateMediaItem(host, { eventId, mediaId: official.id, action: 'approve' });
    const rows = await prisma.outboxEvent.findMany({
      where: { topic: 'media/watermark' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(rows.some((row) => (row.payload as { mediaItemId?: string }).mediaItemId === official.id)).toBe(true);

    const guest = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PENDING_REVIEW',
        originalKey: `g/${gallery.id}/nwm.jpg`,
        sizeBytes: 10,
      },
    });
    const before = await prisma.outboxEvent.count({ where: { topic: 'media/watermark' } });
    await moderateMediaItem(host, { eventId, mediaId: guest.id, action: 'approve' });
    expect(await prisma.outboxEvent.count({ where: { topic: 'media/watermark' } })).toBe(before);
  });
});

describe('blockUploader', () => {
  it('blocks the session and hides all their items in one transaction', async () => {
    const { host, eventId, gallery } = await eventWithGallery();
    const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, gallery.id, 'Spammer'));
    await seedPending(gallery.id, sessionId, 2);
    const published = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PUBLISHED',
        originalKey: `g/${gallery.id}/pub.jpg`,
        sizeBytes: 10,
        uploaderSessionId: sessionId,
      },
    });
    const { blocked, hiddenCount } = await blockUploader(host, { eventId, mediaId: published.id });
    expect(blocked).toBe(true);
    expect(hiddenCount).toBe(3);
    expect((await prisma.guestSession.findUniqueOrThrow({ where: { id: sessionId } })).blockedAt).not.toBeNull();
    expect(
      await prisma.mediaItem.count({ where: { galleryId: gallery.id, uploaderSessionId: sessionId, state: 'HIDDEN' } }),
    ).toBe(3);
    // Blocked sessions cannot upload again (uploads.ts gate).
    const { createUpload } = await import('./uploads.js');
    await expect(
      createUpload(
        { kind: 'gallery-session', sessionId, galleryId: gallery.id },
        {
          eventId,
          album: 'GUEST',
          fileName: 'x.jpg',
          mime: 'image/jpeg',
          sizeBytes: 10,
          kind: 'PHOTO',
        },
      ),
    ).rejects.toThrow();
  });
});

describe('dashboard + queues', () => {
  it('counts states, uploaders and open reports; pending lists oldest first', async () => {
    const { host, eventId, gallery } = await eventWithGallery();
    const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, gallery.id, 'Ada'));
    await seedPending(gallery.id, sessionId, 2);
    await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'OFFICIAL',
        kind: 'PHOTO',
        state: 'PUBLISHED',
        originalKey: `g/${gallery.id}/off.jpg`,
        sizeBytes: 10,
        uploaderUserId: host.userId,
      },
    });
    const dashboard = await getMomentsDashboard(host, eventId);
    expect(dashboard.counts).toMatchObject({ pending: 2, published: 1, total: 3 });
    expect(dashboard.counts.uploaders).toBe(2);
    expect(dashboard.gallery.code).toBe(gallery.code);

    const pending = await listPendingMedia(host, eventId, { limit: 1 });
    expect(pending.items).toHaveLength(1);
    expect(pending.nextCursor).toBeTruthy();
    expect(pending.items[0]?.uploaderLabel).toBe('Ada');
    const rest = await listPendingMedia(host, eventId, ...(pending.nextCursor ? [{ cursor: pending.nextCursor }] : []));
    expect(rest.items).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();

    const reported = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PUBLISHED',
        originalKey: `g/${gallery.id}/rep.jpg`,
        sizeBytes: 10,
      },
    });
    const { reportId } = await requestMediaRemoval({ kind: 'anonymous' }, { mediaId: reported.id, reason: 'me' });
    const { reports } = await listOpenMediaReports(host, eventId);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.id).toBe(reportId);
    expect(reports[0]).toMatchObject({ reason: 'me', reporterLabel: 'Anonymous' });
    expect(reports[0]?.item?.id).toBe(reported.id);

    const stranger = await makeHost();
    await expect(getMomentsDashboard(stranger, eventId)).rejects.toThrow();
  });
});

describe('resolveMediaReport', () => {
  it('closes open reports for moderators only', async () => {
    const { host, eventId, gallery } = await eventWithGallery();
    const item = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PUBLISHED',
        originalKey: `g/${gallery.id}/rr.jpg`,
        sizeBytes: 10,
      },
    });
    const { reportId } = await requestMediaRemoval({ kind: 'anonymous' }, { mediaId: item.id });
    const stranger = await makeHost();
    await expect(resolveMediaReport(stranger, { eventId, reportId })).rejects.toThrow();
    await expect(resolveMediaReport(host, { eventId, reportId })).resolves.toEqual({ resolved: true });
    expect((await prisma.report.findUniqueOrThrow({ where: { id: reportId } })).status).toBe('RESOLVED');
  });
});
