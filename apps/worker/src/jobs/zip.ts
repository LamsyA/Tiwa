import { createElement } from 'react';
import { env } from '@tiwa/config';
import { createLogger } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { ZipEmail, type EmailProvider } from '@tiwa/messaging';
import { S3Storage, type Storage } from '@tiwa/storage';
import JSZip from 'jszip';
import { z } from 'zod';
import { providers } from './providers.js';

type Log = ReturnType<typeof createLogger>;

export const MEDIA_ZIP_JOB = 'media/zip' as const;

const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024;
const LINK_TTL_SEC = 7 * 24 * 60 * 60;

const zipPayloadSchema = z.object({ zipId: z.string().uuid() });

interface ZipTools {
  storagePrivate?: Storage | undefined;
  email?: EmailProvider | undefined;
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

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
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

async function fail(zipId: string, reason: string, log: Log): Promise<{ status: 'FAILED' }> {
  await prisma.mediaZip.updateMany({
    where: { id: zipId, status: 'PENDING' },
    data: { status: 'FAILED', failReason: reason },
  });
  await auditSystem('MediaZip', zipId, 'media.zipFailed', { reason });
  log.info({ topic: MEDIA_ZIP_JOB, zipId, reason }, 'zip failed');
  return { status: 'FAILED' as const };
}

/**
 * Gallery takeout (P5-T11, MOM-13): packs published originals into
 * `Official/` + `Guest/` folders, stores the ZIP privately and emails a
 * 7-day signed link to the requester. Cap 2 GB; originals are already
 * compressed, so the ZIP uses STORE for speed. Idempotent per row id.
 */
export async function handleZip(data: unknown, log: Log, tools: ZipTools = {}): Promise<{ status: string }> {
  const { zipId } = zipPayloadSchema.parse(data);
  const store = privateStorage(tools.storagePrivate);
  const email = tools.email ?? providers().email;

  const row = await prisma.mediaZip.findUnique({ where: { id: zipId } });
  if (!row) {
    log.info({ topic: MEDIA_ZIP_JOB, zipId }, 'zip row gone, skipping');
    return { status: 'missing' };
  }
  if (row.status !== 'PENDING') {
    log.info({ topic: MEDIA_ZIP_JOB, zipId, status: row.status }, 'already handled, skipping');
    return { status: row.status };
  }
  const gallery = await prisma.gallery.findUnique({
    where: { id: row.galleryId },
    select: { id: true, event: { select: { id: true, name: true } } },
  });
  if (!gallery) {
    log.info({ topic: MEDIA_ZIP_JOB, zipId }, 'gallery gone, skipping');
    return { status: 'missing' };
  }

  const items = await prisma.mediaItem.findMany({
    where: { galleryId: row.galleryId, deletedAt: null, state: 'PUBLISHED' },
    orderBy: [{ album: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, album: true, originalKey: true, sizeBytes: true },
  });
  if (items.length === 0) return fail(zipId, 'empty', log);
  const total = items.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (total > MAX_ZIP_BYTES) return fail(zipId, 'too-big', log);

  const zip = new JSZip();
  let count = 0;
  for (const item of items) {
    const file = await store.get(item.originalKey);
    if (!file) {
      log.info({ topic: MEDIA_ZIP_JOB, zipId, mediaItemId: item.id }, 'original missing, skipping file');
      continue;
    }
    const base = item.originalKey.split('/').pop() ?? `${item.id}.bin`;
    zip.file(`${item.album === 'OFFICIAL' ? 'Official' : 'Guest'}/${base}`, file.body, { binary: true });
    count += 1;
  }
  if (count === 0) return fail(zipId, 'empty', log);

  const body = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  const key = `exports/${row.galleryId}/${zipId}.zip`;
  await store.put(key, body, 'application/zip');

  const requester = row.requestedByUserId
    ? await prisma.user.findUnique({ where: { id: row.requestedByUserId }, select: { name: true, email: true } })
    : null;
  const link = await store.getSignedUrl(key, LINK_TTL_SEC);
  if (requester?.email) {
    await email
      .send({
        to: requester.email,
        subject: `Your photo download is ready: ${gallery.event.name}`,
        react: createElement(ZipEmail, {
          guestName: requester.name ?? 'there',
          eventName: gallery.event.name,
          itemCount: count,
          sizeLabel: sizeLabel(body.byteLength),
          downloadUrl: link,
        }),
      })
      .catch((error: unknown) => {
        log.info(
          { topic: MEDIA_ZIP_JOB, zipId, err: error instanceof Error ? error.message : String(error) },
          'zip email failed (non-fatal)',
        );
      });
  }

  await prisma.mediaZip.update({
    where: { id: row.id },
    data: { status: 'READY', key, sizeBytes: body.byteLength, itemCount: count, readyAt: new Date() },
  });
  await auditSystem('MediaZip', row.id, 'media.zipReady', { items: count });
  log.info({ topic: MEDIA_ZIP_JOB, zipId, items: count, bytes: body.byteLength }, 'zip ready');
  return { status: 'READY' };
}
