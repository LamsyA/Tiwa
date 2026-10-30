import { prisma } from '@tiwa/db';
import { FakeStorage } from '@tiwa/storage';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { addParticipant } from '../events/members.js';
import { ensureGallery } from './galleries.js';
import {
  abortUpload,
  completeUpload,
  createGuestSession,
  createUpload,
  guestSessionCookieName,
  signGuestSession,
  signS3Upload,
  verifyGuestSessionCookie,
  VIDEO_MAX_BYTES,
} from './uploads.js';

const users: string[] = [];
const events: string[] = [];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function eventWithGallery() {
  const host = await makeHost();
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  events.push(eventId);
  await prisma.event.update({ where: { id: eventId }, data: { startsAt: new Date('2031-03-01T15:00:00Z') } });
  const gallery = await prisma.$transaction((tx) => ensureGallery(tx, eventId));
  return { host, eventId, galleryId: gallery.id };
}

afterAll(async () => {
  await prisma.mediaItem.deleteMany({ where: { gallery: { eventId: { in: events } } } });
  await prisma.guestbookMessage.deleteMany({
    where: {
      galleryId: {
        in: (await prisma.gallery.findMany({ where: { eventId: { in: events } }, select: { id: true } })).map(
          (row) => row.id,
        ),
      },
    },
  });
  await prisma.guestSession.deleteMany({
    where: {
      galleryId: {
        in: (await prisma.gallery.findMany({ where: { eventId: { in: events } }, select: { id: true } })).map(
          (row) => row.id,
        ),
      },
    },
  });
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

describe('createUpload', () => {
  it('mints a MediaItem row and key with no S3 calls', async () => {
    const { host, eventId } = await eventWithGallery();
    const result = await createUpload(host, {
      eventId,
      album: 'GUEST',
      fileName: 'party.jpg',
      mime: 'image/jpeg',
      sizeBytes: 1024 * 1024,
      kind: 'PHOTO',
    });
    expect(result.mediaId).toBeTruthy();
    expect(result.key).toContain(result.mediaId);
    expect(result.key.endsWith('/party.jpg')).toBe(true);
    const item = await prisma.mediaItem.findUniqueOrThrow({ where: { id: result.mediaId } });
    expect(item).toMatchObject({ state: 'UPLOADING', kind: 'PHOTO', originalKey: result.key });
  });

  it('rejects bad types, oversize files and official uploads by guests', async () => {
    const { host, eventId, galleryId } = await eventWithGallery();
    const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, galleryId, 'Ada'));
    const guest = { kind: 'gallery-session' as const, sessionId, galleryId };
    await expect(
      createUpload(guest, {
        eventId,
        album: 'GUEST',
        fileName: 'x.exe',
        mime: 'application/x-msdownload',
        sizeBytes: 100,
        kind: 'PHOTO',
      }),
    ).rejects.toThrow(/Unsupported file type/);
    await expect(
      createUpload(guest, {
        eventId,
        album: 'GUEST',
        fileName: 'big.mp4',
        mime: 'video/mp4',
        sizeBytes: VIDEO_MAX_BYTES + 1,
        kind: 'VIDEO',
      }),
    ).rejects.toThrow(/too large/i);
    await expect(
      createUpload(guest, {
        eventId,
        album: 'OFFICIAL',
        fileName: 'a.jpg',
        mime: 'image/jpeg',
        sizeBytes: 100,
        kind: 'PHOTO',
      }),
    ).rejects.toThrow(/guest album/);
    await expect(
      createUpload(host, {
        eventId,
        album: 'OFFICIAL',
        fileName: 'a.jpg',
        mime: 'image/jpeg',
        sizeBytes: 100,
        kind: 'PHOTO',
      }),
    ).rejects.toThrow();
    expect(galleryId).toBeTruthy();
  });

  it('enforces the gallery item limit', async () => {
    const { host, eventId } = await eventWithGallery();
    await prisma.event.update({ where: { id: eventId }, data: { gallery: { update: { itemLimit: 0 } } } });
    await expect(
      createUpload(host, {
        eventId,
        album: 'GUEST',
        fileName: 'a.jpg',
        mime: 'image/jpeg',
        sizeBytes: 100,
        kind: 'PHOTO',
      }),
    ).rejects.toThrow(/full/);
  });
});

describe('signS3Upload', () => {
  it('signs each S3 op against the row key and rejects strangers', async () => {
    const storage = new FakeStorage();
    const { eventId, galleryId } = await eventWithGallery();
    const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, galleryId));
    const guest = { kind: 'gallery-session' as const, sessionId, galleryId };
    const started = await createUpload(guest, {
      eventId,
      album: 'GUEST',
      fileName: 'a.jpg',
      mime: 'image/jpeg',
      sizeBytes: 100,
      kind: 'PHOTO',
    });
    const key = started.key;
    expect((await signS3Upload(storage, guest, { key, method: 'POST' })).url).toContain('fake://mpu-create/');
    expect((await signS3Upload(storage, guest, { key, method: 'PUT', uploadId: 'up-1', partNumber: 1 })).url).toContain(
      'fake://part/',
    );
    expect((await signS3Upload(storage, guest, { key, method: 'POST', uploadId: 'up-1' })).url).toContain(
      'fake://mpu-complete/',
    );
    expect((await signS3Upload(storage, guest, { key, method: 'DELETE', uploadId: 'up-1' })).url).toContain(
      'fake://mpu-abort/',
    );
    expect((await signS3Upload(storage, guest, { key, method: 'GET', uploadId: 'up-1' })).url).toContain(
      'fake://mpu-list/',
    );
    await expect(signS3Upload(storage, guest, { key, method: 'PUT', uploadId: 'up-1' })).rejects.toThrow(
      /part number/i,
    );
    await expect(
      signS3Upload(storage, guest, {
        key: 'galleries/x/originals/00000000-0000-0000-0000-000000000000/a.jpg',
        method: 'POST',
      }),
    ).rejects.toThrow();

    const { sessionId: otherId } = await prisma.$transaction((tx) => createGuestSession(tx, galleryId));
    await expect(
      signS3Upload(storage, { kind: 'gallery-session', sessionId: otherId, galleryId }, { key, method: 'POST' }),
    ).rejects.toThrow();
  });
});

describe('complete/abort', () => {
  it('completes on an existing object and enqueues processing', async () => {
    const storage = new FakeStorage();
    const { eventId, galleryId } = await eventWithGallery();
    const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, galleryId));
    const guest = { kind: 'gallery-session' as const, sessionId, galleryId };
    const started = await createUpload(guest, {
      eventId,
      album: 'GUEST',
      fileName: 'a.jpg',
      mime: 'image/jpeg',
      sizeBytes: 100,
      kind: 'PHOTO',
    });
    const row = await prisma.mediaItem.findUniqueOrThrow({ where: { id: started.mediaId } });
    await storage.put(row.originalKey, new Uint8Array([1, 2, 3]), 'image/jpeg');
    const done = await completeUpload(storage, guest, { mediaId: started.mediaId });
    expect(done).toEqual({ mediaId: started.mediaId });
    const item = await prisma.mediaItem.findUniqueOrThrow({ where: { id: started.mediaId } });
    expect(item.state).toBe('PROCESSING');
    expect(item.sizeBytes).toBe(3);
    const outbox = await prisma.outboxEvent.findFirst({
      where: { topic: 'media/process-image' },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox?.payload).toMatchObject({ mediaItemId: started.mediaId });
    await prisma.outboxEvent.deleteMany({ where: { topic: { in: ['media/process-image', 'media/process-video'] } } });
  });

  it('rejects completing a missing object and drops aborted uploads', async () => {
    const storage = new FakeStorage();
    const { host, eventId } = await eventWithGallery();
    const started = await createUpload(host, {
      eventId,
      album: 'GUEST',
      fileName: 'a.jpg',
      mime: 'image/jpeg',
      sizeBytes: 100,
      kind: 'PHOTO',
    });
    await expect(completeUpload(storage, host, { mediaId: started.mediaId })).rejects.toThrow(/empty/i);
    await expect(await abortUpload(host, { mediaId: started.mediaId })).toEqual({ aborted: true });
    expect(await prisma.mediaItem.findUnique({ where: { id: started.mediaId } })).toBeNull();
  });
});

describe('guest sessions', () => {
  it('signs and verifies session cookies; rejects tampering', () => {
    const secret = 'test-secret-0123456789abcdef';
    const token = signGuestSession('session-1', secret);
    expect(verifyGuestSessionCookie(token, secret)).toBe('session-1');
    expect(verifyGuestSessionCookie(`${token}x`, secret)).toBeNull();
    expect(verifyGuestSessionCookie(undefined, secret)).toBeNull();
    expect(guestSessionCookieName('g1')).toBe('tiwa_gs_g1');
  });

  it('blocked sessions cannot upload', async () => {
    const { eventId, galleryId } = await eventWithGallery();
    const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, galleryId));
    await prisma.guestSession.update({ where: { id: sessionId }, data: { blockedAt: new Date() } });
    await expect(
      createUpload(
        { kind: 'gallery-session', sessionId, galleryId },
        { eventId, album: 'GUEST', fileName: 'a.jpg', mime: 'image/jpeg', sizeBytes: 100, kind: 'PHOTO' },
      ),
    ).rejects.toThrow(/not allowed/);
  });

  it('view-only members may upload to the guest album but not the official one', async () => {
    const { host, eventId } = await eventWithGallery();
    const invite = await addParticipant(host, {
      eventId,
      phone: '+2348030000111',
      role: 'CO_HOST',
      preset: 'view_only',
    });
    users.push(invite.userId);
    const viewer = { kind: 'user' as const, userId: invite.userId, isAdmin: false };
    const ok = await createUpload(viewer, {
      eventId,
      album: 'GUEST',
      fileName: 'a.jpg',
      mime: 'image/jpeg',
      sizeBytes: 100,
      kind: 'PHOTO',
    });
    expect(ok.mediaId).toBeTruthy();
    await prisma.mediaItem.delete({ where: { id: ok.mediaId } });
    await expect(
      createUpload(viewer, {
        eventId,
        album: 'OFFICIAL',
        fileName: 'a.jpg',
        mime: 'image/jpeg',
        sizeBytes: 100,
        kind: 'PHOTO',
      }),
    ).rejects.toThrow(/Not allowed|upload/);
  });
});
