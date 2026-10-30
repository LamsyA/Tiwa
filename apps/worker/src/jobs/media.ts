import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '@tiwa/config';
import { createLogger } from '@tiwa/core';
import { createModerationProvider, type ModerationProvider } from '@tiwa/moderation';
import { prisma } from '@tiwa/db';
import { S3Storage, type Storage } from '@tiwa/storage';
import { Redis } from 'ioredis';
import sharp from 'sharp';
import { z } from 'zod';
import type { FanOutSink } from './send-invite.js';

type Log = ReturnType<typeof createLogger>;

const execFileAsync = promisify(execFile);

/**
 * Backend.md §10 media pipeline: `media/process-image|video` run after
 * upload (arc §5), then `media/moderate` routes the item to
 * PUBLISHED | PENDING_REVIEW | BLOCKED. Terminal states publish on
 * `gallery:{galleryId}` for the live gallery (UF-10-5).
 */
export const MEDIA_PROCESS_IMAGE_TOPIC = 'media/process-image' as const;
export const MEDIA_PROCESS_VIDEO_TOPIC = 'media/process-video' as const;
export const MEDIA_MODERATE_JOB = 'media/moderate' as const;

const THUMB_PX = 320;
const LARGE_PX = 1080;
const BLUR_PX = 16;

const itemPayloadSchema = z.object({ mediaItemId: z.string().uuid() });

interface MediaTools {
  storagePrivate?: Storage | undefined;
  storagePublic?: Storage | undefined;
  moderation?: ModerationProvider | undefined;
  /** Shell out to ffmpeg/ffprobe (injected in tests). */
  probe?:
    | ((path: string) => Promise<{ durationSec: number | null; width: number | null; height: number | null }>)
    | undefined;
  transcode?: ((inputPath: string, mp4Path: string, posterPath: string) => Promise<void>) | undefined;
}

function privateStorage(overridden?: Storage): Storage {
  return (
    overridden ??
    new S3Storage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET_PRIVATE,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    })
  );
}

function publicStorage(overridden?: Storage): Storage {
  return (
    overridden ??
    new S3Storage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET_PUBLIC,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    })
  );
}

function moderation(overridden?: ModerationProvider): ModerationProvider {
  return overridden ?? createModerationProvider(env.MODERATION_PROVIDER);
}

const globalLive = globalThis as unknown as { __tiwaWorkerMedia?: Redis };

function live(): Redis {
  globalLive.__tiwaWorkerMedia ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  globalLive.__tiwaWorkerMedia.on('error', () => undefined);
  return globalLive.__tiwaWorkerMedia;
}

async function publishGallery(galleryId: string): Promise<void> {
  await live()
    .publish(`gallery:${galleryId}`, JSON.stringify({ kind: 'gallery', at: Date.now() }))
    .catch(() => undefined);
}

async function auditSystem(
  targetType: string,
  targetId: string,
  action: string,
  data: Record<string, string | number>,
): Promise<void> {
  await prisma.auditLog
    .create({ data: { actorId: null, actorType: 'system', action, targetType, targetId, data } })
    .catch(() => undefined);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function derivativePrefix(galleryId: string, sha: string): string {
  return `galleries/${galleryId}/derivatives/${sha.slice(0, 16)}`;
}

async function blurDataUrl(image: sharp.Sharp): Promise<string> {
  const tiny = await image.clone().resize(BLUR_PX, BLUR_PX, { fit: 'inside' }).jpeg({ quality: 40 }).toBuffer();
  return `data:image/jpeg;base64,${tiny.toString('base64')}`;
}

function fail(log: Log, topic: string, mediaId: string, reason: string): Promise<{ status: 'FAILED' }> {
  return (async () => {
    await prisma.mediaItem.updateMany({ where: { id: mediaId, state: 'PROCESSING' }, data: { state: 'FAILED' } });
    const item = await prisma.mediaItem.findUnique({ where: { id: mediaId }, select: { galleryId: true } });
    await auditSystem('MediaItem', mediaId, 'media.processFailed', { reason });
    if (item) await publishGallery(item.galleryId);
    log.info({ topic, mediaId, reason }, 'media processing failed');
    return { status: 'FAILED' as const };
  })();
}

async function enqueueModerate(sink: FanOutSink, mediaId: string): Promise<void> {
  await sink.add(
    MEDIA_MODERATE_JOB,
    { mediaItemId: mediaId },
    {
      jobId: `media-moderate-${mediaId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );
}

async function findDuplicate(
  galleryId: string,
  sha: string,
  selfId: string,
): Promise<{
  id: string;
  thumbKey: string | null;
  largeKey: string | null;
  posterKey: string | null;
  blurDataUrl: string | null;
} | null> {
  return prisma.mediaItem.findFirst({
    where: {
      galleryId,
      sha256: sha,
      id: { not: selfId },
      deletedAt: null,
      state: { in: ['PUBLISHED', 'PENDING_REVIEW'] },
    },
    select: { id: true, thumbKey: true, largeKey: true, posterKey: true, blurDataUrl: true },
  });
}

/**
 * Photo pipeline: rotate by EXIF, keep takenAt, strip the rest; 320 + 1080 in
 * AVIF (stored) and WebP (sibling keys for older clients); blur placeholder;
 * sha256 dedupe shares derivative keys. Deterministic (non-image) failures
 * mark FAILED instead of burning retries.
 */
export async function handleProcessImage(
  data: unknown,
  log: Log,
  sink: FanOutSink,
  tools: MediaTools = {},
): Promise<{ status: string }> {
  const { mediaItemId } = itemPayloadSchema.parse(data);
  const store = privateStorage(tools.storagePrivate);
  const pub = publicStorage(tools.storagePublic);
  const item = await prisma.mediaItem.findUnique({
    where: { id: mediaItemId },
    include: { gallery: { select: { id: true, plan: true } } },
  });
  if (!item || item.deletedAt) {
    log.info({ topic: MEDIA_PROCESS_IMAGE_TOPIC, mediaItemId }, 'already gone, skipping');
    return { status: 'missing' };
  }
  if (item.state !== 'PROCESSING') {
    log.info({ topic: MEDIA_PROCESS_IMAGE_TOPIC, mediaItemId, state: item.state }, 'not processing, skipping');
    return { status: item.state };
  }
  const original = await store.get(item.originalKey);
  if (!original) return fail(log, MEDIA_PROCESS_IMAGE_TOPIC, mediaItemId, 'original-missing');

  const sha = sha256Hex(original.body);
  const dupe = await findDuplicate(item.galleryId, sha, item.id);
  const prefix = derivativePrefix(item.galleryId, sha);
  try {
    const base = sharp(original.body, { failOn: 'none' }).rotate();
    const metadata = await base.metadata();
    const { default: exifr } = await import('exifr');
    let takenAt: Date | null = null;
    try {
      const parsed = (await exifr.parse(original.body, ['DateTimeOriginal', 'CreateDate'])) as
        { DateTimeOriginal?: Date; CreateDate?: Date } | undefined;
      const stamp = parsed?.DateTimeOriginal ?? parsed?.CreateDate;
      if (stamp instanceof Date && !Number.isNaN(stamp.getTime())) takenAt = stamp;
    } catch {
      takenAt = null;
    }

    const builds: { key: string; body: Uint8Array }[] = [];
    for (const size of [THUMB_PX, LARGE_PX] as const) {
      const resized = base.clone().resize(size, size, { fit: 'inside', withoutEnlargement: true });
      const [avif, webp] = await Promise.all([
        resized.clone().avif({ quality: 50, effort: 4 }).toBuffer(),
        resized.clone().webp({ quality: 80 }).toBuffer(),
      ]);
      builds.push({ key: `${prefix}/img_${size}.avif`, body: avif });
      builds.push({ key: `${prefix}/img_${size}.webp`, body: webp });
    }
    const blur = await blurDataUrl(base);
    const width = metadata.width ?? null;
    const height = metadata.height ?? null;

    if (!dupe) {
      for (const build of builds)
        await pub.put(build.key, build.body, build.key.endsWith('.avif') ? 'image/avif' : 'image/webp');
    }
    await prisma.mediaItem.update({
      where: { id: item.id },
      data: {
        sha256: sha,
        width,
        height,
        takenAt,
        thumbKey: dupe?.thumbKey ?? `${prefix}/img_${THUMB_PX}.avif`,
        largeKey: dupe?.largeKey ?? `${prefix}/img_${LARGE_PX}.avif`,
        blurDataUrl: blur,
      },
    });
    await enqueueModerate(sink, item.id);
    log.info({ topic: MEDIA_PROCESS_IMAGE_TOPIC, mediaItemId, dupe: Boolean(dupe) }, 'image processed');
    return { status: 'PROCESSING' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.info({ job: MEDIA_PROCESS_IMAGE_TOPIC, mediaItemId, err: message.slice(0, 120) }, 'image processing failed');
    return fail(log, MEDIA_PROCESS_IMAGE_TOPIC, mediaItemId, 'unprocessable');
  }
}

async function defaultProbe(
  path: string,
): Promise<{ durationSec: number | null; width: number | null; height: number | null }> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration,size',
      '-show_entries',
      'stream=width,height,codec_type',
      '-of',
      'json',
      path,
    ],
    { timeout: 60_000 },
  );
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: { codec_type?: string; width?: number; height?: number }[];
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const duration = parsed.format?.duration ? Number.parseFloat(parsed.format.duration) : NaN;
  return {
    durationSec: Number.isFinite(duration) ? duration : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
  };
}

async function defaultTranscode(inputPath: string, mp4Path: string, posterPath: string): Promise<void> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', inputPath],
    { timeout: 60_000 },
  ).catch(() => ({ stdout: '' }));
  const audioArgs = stdout.trim() ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an'];
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=-2:720',
      '-crf',
      '23',
      '-preset',
      'veryfast',
      ...audioArgs,
      '-movflags',
      '+faststart',
      mp4Path,
    ],
    { timeout: 600_000, maxBuffer: 64 * 1024 * 1024 },
  );
  await execFileAsync(
    'ffmpeg',
    ['-y', '-ss', '1', '-i', inputPath, '-vframes', '1', '-vf', 'scale=-2:480', '-q:v', '4', posterPath],
    { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 },
  );
}

function videoLimitSec(plan: string): number {
  return plan === 'PLUS' ? 3 * 60 : 30;
}

/**
 * Video pipeline: duration gate (FREE 30 s, PLUS 3 min), H.264 720p MP4 +
 * poster, then the same moderate step as photos. Over-limit videos FAIL
 * with a reason instead of retrying forever.
 */
export async function handleProcessVideo(
  data: unknown,
  log: Log,
  sink: FanOutSink,
  tools: MediaTools = {},
): Promise<{ status: string }> {
  const { mediaItemId } = itemPayloadSchema.parse(data);
  const store = privateStorage(tools.storagePrivate);
  const pub = publicStorage(tools.storagePublic);
  const probe = tools.probe ?? defaultProbe;
  const transcode = tools.transcode ?? defaultTranscode;
  const item = await prisma.mediaItem.findUnique({
    where: { id: mediaItemId },
    include: { gallery: { select: { id: true, plan: true } } },
  });
  if (!item || item.deletedAt) {
    log.info({ topic: MEDIA_PROCESS_VIDEO_TOPIC, mediaItemId }, 'already gone, skipping');
    return { status: 'missing' };
  }
  if (item.state !== 'PROCESSING') {
    log.info({ topic: MEDIA_PROCESS_VIDEO_TOPIC, mediaItemId, state: item.state }, 'not processing, skipping');
    return { status: item.state };
  }
  const original = await store.get(item.originalKey);
  if (!original) return fail(log, MEDIA_PROCESS_VIDEO_TOPIC, mediaItemId, 'original-missing');

  const sha = sha256Hex(original.body);
  const dupe = await findDuplicate(item.galleryId, sha, item.id);
  const prefix = derivativePrefix(item.galleryId, sha);
  const mp4Key = `${prefix}/vid_720.mp4`;
  const posterKey = `${prefix}/poster.jpg`;
  const dir = await mkdtemp(join(tmpdir(), 'tiwa-video-'));
  try {
    const inputPath = join(dir, 'original.bin');
    await writeFile(inputPath, original.body);
    const meta = await probe(inputPath).catch(() => ({
      durationSec: null,
      width: null as number | null,
      height: null as number | null,
    }));
    const limit = videoLimitSec(item.gallery.plan);
    if (meta.durationSec !== null && meta.durationSec > limit) {
      await auditSystem('MediaItem', item.id, 'media.processFailed', { reason: 'too-long' });
      await prisma.mediaItem.updateMany({ where: { id: item.id, state: 'PROCESSING' }, data: { state: 'FAILED' } });
      await publishGallery(item.galleryId);
      log.info({ topic: MEDIA_PROCESS_VIDEO_TOPIC, mediaItemId, duration: meta.durationSec }, 'video too long');
      return { status: 'FAILED' };
    }
    let blur: string | undefined;
    if (!dupe) {
      await transcode(inputPath, join(dir, 'out.mp4'), join(dir, 'poster.jpg'));
      await pub.put(mp4Key, await readFile(join(dir, 'out.mp4')), 'video/mp4');
      const posterBytes = await readFile(join(dir, 'poster.jpg'));
      await pub.put(posterKey, posterBytes, 'image/jpeg');
      blur = await blurDataUrl(sharp(posterBytes));
    }
    await prisma.mediaItem.update({
      where: { id: item.id },
      data: {
        sha256: sha,
        width: meta.width,
        height: meta.height,
        durationSec: meta.durationSec !== null ? Math.round(meta.durationSec) : item.durationSec,
        thumbKey: dupe?.thumbKey ?? posterKey,
        largeKey: dupe?.largeKey ?? mp4Key,
        posterKey: dupe?.posterKey ?? posterKey,
        ...(blur ? { blurDataUrl: blur } : dupe?.blurDataUrl ? { blurDataUrl: dupe.blurDataUrl } : {}),
      },
    });
    await enqueueModerate(sink, item.id);
    log.info({ topic: MEDIA_PROCESS_VIDEO_TOPIC, mediaItemId, dupe: Boolean(dupe) }, 'video processed');
    return { status: 'PROCESSING' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.info({ job: MEDIA_PROCESS_VIDEO_TOPIC, mediaItemId, err: message.slice(0, 120) }, 'video processing failed');
    return fail(log, MEDIA_PROCESS_VIDEO_TOPIC, mediaItemId, 'unprocessable');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Safety scan (D-P07, D-X17): every item, both albums. APPROVE publishes
 * instantly or holds for review per the gallery mode; REVIEW always holds;
 * BLOCK hides unconditionally. Fake approves — never production data.
 */
export async function handleModerate(
  data: unknown,
  log: Log,
  tools: { moderation?: ModerationProvider } = {},
): Promise<{ status: string }> {
  const { mediaItemId } = itemPayloadSchema.parse(data);
  const mod = moderation(tools.moderation);
  const item = await prisma.mediaItem.findUnique({
    where: { id: mediaItemId },
    include: { gallery: { select: { id: true, moderation: true } } },
  });
  if (!item || item.deletedAt) {
    log.info({ topic: MEDIA_MODERATE_JOB, mediaItemId }, 'already gone, skipping');
    return { status: 'missing' };
  }
  if (item.state !== 'PROCESSING') {
    log.info({ topic: MEDIA_MODERATE_JOB, mediaItemId, state: item.state }, 'not processing, skipping');
    return { status: item.state };
  }
  const key = item.largeKey ?? item.thumbKey ?? item.originalKey;
  const verdict = await mod
    .scan({ key, mime: item.kind === 'PHOTO' ? 'image/avif' : 'video/mp4', sizeBytes: item.sizeBytes, kind: item.kind })
    .catch((error: unknown) => {
      throw error;
    });
  const next =
    verdict.verdict === 'BLOCK'
      ? 'BLOCKED'
      : verdict.verdict === 'REVIEW' || item.gallery.moderation === 'APPROVE_FIRST'
        ? 'PENDING_REVIEW'
        : 'PUBLISHED';
  await prisma.$transaction(async (tx) => {
    await tx.mediaItem.update({
      where: { id: item.id },
      data: { state: next, moderationLabels: verdict.labels },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        actorType: 'system',
        action: 'media.moderate',
        targetType: 'MediaItem',
        targetId: item.id,
        data: { verdict: verdict.verdict, review: next },
      },
    });
  });
  await publishGallery(item.gallery.id);
  log.info({ topic: MEDIA_MODERATE_JOB, mediaItemId, verdict: verdict.verdict, review: next }, 'moderated');
  return { status: next };
}
