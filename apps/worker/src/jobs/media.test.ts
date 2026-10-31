import { createEventDraft } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { FakeModeration } from '@tiwa/moderation';
import { FakeStorage } from '@tiwa/storage';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import {
  MEDIA_MODERATE_JOB,
  handleModerate,
  handleProcessImage,
  handleProcessVideo,
  handleWatermark,
} from './media.js';
import type { FanOutSink } from './send-invite.js';

const users: string[] = [];
const eventIds: string[] = [];
const galleryIds: string[] = [];

const fakeLog = { info: () => undefined } as unknown as Parameters<typeof handleProcessImage>[1];

function fakeSink() {
  const jobs: { name: string; data: unknown; jobId: string }[] = [];
  const sink = {
    async add(name: string, data: unknown, opts: { jobId: string }) {
      if (!jobs.some((job) => job.jobId === opts.jobId)) jobs.push({ name, data, jobId: opts.jobId });
    },
  } as unknown as FanOutSink;
  return { jobs, sink };
}

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function makeGallery(plan: 'FREE' | 'PLUS' = 'FREE') {
  const host = await makeHost();
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  eventIds.push(eventId);
  await prisma.event.update({ where: { id: eventId }, data: { startsAt: new Date('2031-05-01T12:00:00Z') } });
  const gallery = await prisma.gallery.create({
    data: { eventId, code: `t04-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, accessCode: 'ABCDEF', plan },
  });
  galleryIds.push(gallery.id);
  return { host, eventId, gallery };
}

async function redPng(width = 64, height = 48): Promise<Uint8Array> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .png()
    .toBuffer();
}

afterAll(async () => {
  await prisma.mediaItem.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestSession.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.gallery.deleteMany({ where: { id: { in: galleryIds } } });
  await prisma.task.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.programmeItem.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.eventDay.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.budgetCategory.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: [...eventIds, ...galleryIds] } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('media/process-image', () => {
  it('derives AVIF+WebP sizes, blur and sha, then queues moderation', async () => {
    const storage = new FakeStorage();
    const pub = new FakeStorage();
    const { gallery } = await makeGallery();
    const bytes = await redPng();
    const key = `galleries/${gallery.id}/originals/test.png`;
    await storage.put(key, bytes, 'image/png');
    const item = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PROCESSING',
        originalKey: key,
        sizeBytes: bytes.byteLength,
      },
    });

    const { sink, jobs } = fakeSink();
    const result = await handleProcessImage({ mediaItemId: item.id }, fakeLog, sink, {
      storagePrivate: storage,
      storagePublic: pub,
    });
    expect(result).toEqual({ status: 'PROCESSING' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ name: MEDIA_MODERATE_JOB });

    const updated = await prisma.mediaItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(updated.thumbKey).toContain('_320.avif');
    expect(updated.largeKey).toContain('_1080.avif');
    expect(updated.blurDataUrl?.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(updated.width).toBe(64);
    expect(updated.takenAt).toBeNull();
    // Sibling WebP variants exist next to the stored AVIF keys.
    expect(await pub.head(updated.thumbKey as string).then((h) => h)).not.toBeNull();
    const webp = await pub.head((updated.thumbKey as string).replace('.avif', '.webp'));
    expect(webp).not.toBeNull();
  });

  it('shares derivative keys on duplicate content instead of re-storing', async () => {
    const storage = new FakeStorage();
    const pub = new FakeStorage();
    const { gallery } = await makeGallery();
    const bytes = await redPng(32, 32);
    const first = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PROCESSING',
        originalKey: `galleries/${gallery.id}/originals/a.png`,
        sizeBytes: bytes.byteLength,
      },
    });
    await storage.put(`galleries/${gallery.id}/originals/a.png`, bytes, 'image/png');
    const firstSink = fakeSink();
    await handleProcessImage({ mediaItemId: first.id }, fakeLog, firstSink.sink, {
      storagePrivate: storage,
      storagePublic: pub,
    });
    // Same bytes, new row → dupe shares the first row's keys (no new uploads).
    const dupe = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PROCESSING',
        originalKey: `galleries/${gallery.id}/originals/b.png`,
        sizeBytes: bytes.byteLength,
      },
    });
    await storage.put(`galleries/${gallery.id}/originals/b.png`, bytes, 'image/png');
    const { sink, jobs } = fakeSink();
    const objectCount = pub.objects.size;
    await handleProcessImage({ mediaItemId: dupe.id }, fakeLog, sink, { storagePrivate: storage, storagePublic: pub });
    expect(jobs).toHaveLength(1);
    const updated = await prisma.mediaItem.findUniqueOrThrow({ where: { id: dupe.id } });
    const original = await prisma.mediaItem.findUniqueOrThrow({ where: { id: first.id } });
    expect(updated.thumbKey).toBe(original.thumbKey);
    expect(updated.largeKey).toBe(original.largeKey);
    expect(pub.objects.size).toBe(objectCount);
  });

  it('skips non-PROCESSING items and fails missing originals', async () => {
    const storage = new FakeStorage();
    const pub = new FakeStorage();
    const { gallery } = await makeGallery();
    const done = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PUBLISHED',
        originalKey: 'gone.png',
        sizeBytes: 1,
      },
    });
    const { sink, jobs } = fakeSink();
    expect(
      await handleProcessImage({ mediaItemId: done.id }, fakeLog, sink, {
        storagePrivate: storage,
        storagePublic: pub,
      }),
    ).toEqual({ status: 'PUBLISHED' });
    const missing = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PROCESSING',
        originalKey: 'nope.png',
        sizeBytes: 1,
      },
    });
    expect(
      await handleProcessImage({ mediaItemId: missing.id }, fakeLog, sink, {
        storagePrivate: storage,
        storagePublic: pub,
      }),
    ).toEqual({ status: 'FAILED' });
    expect(jobs).toHaveLength(0);
  });
});

describe('media/process-video', () => {
  const stubTools = (durationSec: number | null) => ({
    probe: async () => ({ durationSec, width: 640 as number | null, height: 480 as number | null }),
    transcode: async (inputPath: string, mp4Path: string, posterPath: string) => {
      if (!inputPath.endsWith('.bin')) throw new Error('unexpected input');
      await writeFile(mp4Path, Buffer.from('fake-mp4'));
      await writeFile(
        posterPath,
        await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 10, b: 200 } } })
          .jpeg()
          .toBuffer(),
      );
    },
  });

  it('transcodes, uploads mp4 + poster, and queues moderation', async () => {
    const storage = new FakeStorage();
    const pub = new FakeStorage();
    const { gallery } = await makeGallery();
    const key = `galleries/${gallery.id}/originals/clip.mp4`;
    await storage.put(key, new Uint8Array([0, 1, 2, 3]), 'video/mp4');
    const item = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'VIDEO',
        state: 'PROCESSING',
        originalKey: key,
        sizeBytes: 4,
      },
    });
    const { sink, jobs } = fakeSink();
    const result = await handleProcessVideo({ mediaItemId: item.id }, fakeLog, sink, {
      storagePrivate: storage,
      storagePublic: pub,
      ...stubTools(10),
    });
    expect(result).toEqual({ status: 'PROCESSING' });
    expect(jobs).toHaveLength(1);
    const updated = await prisma.mediaItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.largeKey).toContain('vid_720.mp4');
    expect(updated.posterKey).toContain('poster.jpg');
    expect(updated.durationSec).toBe(10);
    expect(updated.thumbKey).toBe(updated.posterKey);
    expect(updated.blurDataUrl?.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('rejects over-limit videos without retrying', async () => {
    const storage = new FakeStorage();
    const pub = new FakeStorage();
    const { gallery } = await makeGallery('FREE');
    const key = `galleries/${gallery.id}/originals/long.mp4`;
    await storage.put(key, new Uint8Array([0, 1, 2, 3]), 'video/mp4');
    const item = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'VIDEO',
        state: 'PROCESSING',
        originalKey: key,
        sizeBytes: 4,
      },
    });
    const { sink, jobs } = fakeSink();
    const result = await handleProcessVideo({ mediaItemId: item.id }, fakeLog, sink, {
      storagePrivate: storage,
      storagePublic: pub,
      ...stubTools(400),
    });
    expect(result).toEqual({ status: 'FAILED' });
    expect(jobs).toHaveLength(0);
    expect((await prisma.mediaItem.findUniqueOrThrow({ where: { id: item.id } })).state).toBe('FAILED');
  });
});

describe('media/moderate', () => {
  async function processingItem(moderation: 'INSTANT' | 'APPROVE_FIRST' = 'INSTANT') {
    const { gallery } = await makeGallery();
    await prisma.gallery.update({ where: { id: gallery.id }, data: { moderation } });
    const item = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PROCESSING',
        originalKey: 'g/m.jpg',
        sizeBytes: 10,
        thumbKey: 'g/t.avif',
        largeKey: 'g/l.avif',
      },
    });
    return { gallery, item };
  }

  it('publishes instantly-approved items, holds the rest', async () => {
    const approve = new FakeModeration();
    const review = new FakeModeration(() => 'REVIEW');
    const { item: instant } = await processingItem('INSTANT');
    expect(await handleModerate({ mediaItemId: instant.id }, fakeLog, { moderation: approve })).toEqual({
      status: 'PUBLISHED',
    });
    const { item: held } = await processingItem('INSTANT');
    expect(await handleModerate({ mediaItemId: held.id }, fakeLog, { moderation: review })).toEqual({
      status: 'PENDING_REVIEW',
    });
    const { item: gated } = await processingItem('APPROVE_FIRST');
    expect(await handleModerate({ mediaItemId: gated.id }, fakeLog, { moderation: approve })).toEqual({
      status: 'PENDING_REVIEW',
    });
  });

  it('blocks on BLOCK and skips non-processing items', async () => {
    const block = new FakeModeration(() => 'BLOCK');
    const { item } = await processingItem('INSTANT');
    expect(await handleModerate({ mediaItemId: item.id }, fakeLog, { moderation: block })).toEqual({
      status: 'BLOCKED',
    });
    const row = await prisma.mediaItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.moderationLabels).toEqual(['fake:block']);
    expect(await handleModerate({ mediaItemId: item.id }, fakeLog, { moderation: block })).toEqual({
      status: 'BLOCKED',
    });
  });
});

describe('media/watermark', () => {
  async function officialItem(
    state: 'PUBLISHED' | 'PENDING_REVIEW' = 'PUBLISHED',
    album: 'OFFICIAL' | 'GUEST' = 'OFFICIAL',
  ) {
    const { gallery } = await makeGallery();
    const item = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album,
        kind: 'PHOTO',
        state,
        originalKey: `g/${gallery.id}/o.png`,
        thumbKey: `g/${gallery.id}/img_320.avif`,
        largeKey: `g/${gallery.id}/img_1080.avif`,
        sizeBytes: 10,
      },
    });
    return { gallery, item };
  }

  it('stamps official photos into .wm siblings and flips the flag', async () => {
    const pub = new FakeStorage();
    const { item } = await officialItem();
    const bytes = await redPng(160, 120);
    await pub.put(item.thumbKey!, bytes, 'image/avif');
    await pub.put(item.largeKey!, bytes, 'image/avif');
    expect(await handleWatermark({ mediaItemId: item.id }, fakeLog, { storagePublic: pub })).toEqual({
      status: 'watermarked',
    });
    const row = await prisma.mediaItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.watermarked).toBe(true);
    expect(row.thumbKey).toBe(`g/${row.galleryId}/img_320.wm.avif`);
    expect(row.largeKey).toBe(`g/${row.galleryId}/img_1080.wm.avif`);
    expect(pub.objects.has(row.thumbKey!)).toBe(true);
    expect(pub.objects.has(row.largeKey!)).toBe(true);
    expect(pub.objects.has(item.thumbKey!)).toBe(true);
    // Idempotent: a second run skips.
    expect(await handleWatermark({ mediaItemId: item.id }, fakeLog, { storagePublic: pub })).toEqual({
      status: 'skipped',
    });
  });

  it('skips guest albums, pending items and missing originals', async () => {
    const pub = new FakeStorage();
    const { item: guest } = await officialItem('PUBLISHED', 'GUEST');
    expect(await handleWatermark({ mediaItemId: guest.id }, fakeLog, { storagePublic: pub })).toEqual({
      status: 'skipped',
    });
    const { item: pending } = await officialItem('PENDING_REVIEW');
    expect(await handleWatermark({ mediaItemId: pending.id }, fakeLog, { storagePublic: pub })).toEqual({
      status: 'skipped',
    });
    const { item: missing } = await officialItem();
    expect(await handleWatermark({ mediaItemId: missing.id }, fakeLog, { storagePublic: pub })).toEqual({
      status: 'skipped',
    });
  });
});
