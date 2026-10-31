import { createElement } from 'react';
import { createLogger, expiryFor, planLimits } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { ExpiryEmail, type EmailProvider } from '@tiwa/messaging';
import { S3Storage, type Storage } from '@tiwa/storage';
import { env } from '@tiwa/config';
import { providers } from './providers.js';

type Log = ReturnType<typeof createLogger>;

export const RETENTION_JOB = 'media/retention' as const;
export const RETENTION_EVERY_MS = 24 * 3600 * 1000;

const WARN_DAYS = 14;

interface RetentionTools {
  storagePrivate?: Storage | undefined;
  email?: EmailProvider | undefined;
  now?: Date | undefined;
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

function webpSibling(key: string): string | null {
  if (!key.endsWith('.avif')) return null;
  const twin = `${key.slice(0, -5)}.webp`;
  return twin === key ? null : twin;
}

function unmarkedTwin(key: string): string | null {
  const dot = key.lastIndexOf('.');
  if (dot < 0 || !key.slice(0, dot).endsWith('.wm')) return null;
  const plain = `${key.slice(0, dot - 3)}${key.slice(dot)}`;
  return plain === key ? null : plain;
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

async function warnedRecently(galleryId: string): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: {
      action: 'media.expiryWarned',
      targetType: 'Gallery',
      targetId: galleryId,
      createdAt: { gt: new Date(Date.now() - 30 * 86400000) },
    },
    select: { id: true },
  });
  return row !== null;
}

async function purgeGallery(store: Storage, galleryId: string, log: Log): Promise<{ items: number; bytes: number }> {
  const items = await prisma.mediaItem.findMany({
    where: { galleryId },
    select: { id: true, originalKey: true, thumbKey: true, largeKey: true, posterKey: true, sizeBytes: true },
  });
  let bytes = 0;
  for (const item of items) {
    bytes += item.sizeBytes;
    const keys = new Set<string>();
    for (const key of [item.originalKey, item.thumbKey, item.largeKey, item.posterKey]) {
      if (!key) continue;
      keys.add(key);
      const twin = webpSibling(key);
      if (twin) keys.add(twin);
      const plain = unmarkedTwin(key);
      if (plain) {
        keys.add(plain);
        const plainTwin = webpSibling(plain);
        if (plainTwin) keys.add(plainTwin);
      }
    }
    await Promise.all([...keys].map((key) => store.delete(key).catch(() => undefined)));
  }
  const zips = await prisma.mediaZip.findMany({ where: { galleryId }, select: { id: true, key: true } });
  await Promise.all(zips.map((zip) => (zip.key ? store.delete(zip.key).catch(() => undefined) : Promise.resolve())));
  await prisma.$transaction(async (tx) => {
    await tx.mediaItem.deleteMany({ where: { galleryId } });
    await tx.mediaZip.deleteMany({ where: { galleryId } });
  });
  await auditSystem('Gallery', galleryId, 'media.purged', { items: items.length, bytes });
  log.info({ topic: RETENTION_JOB, galleryId, items: items.length }, 'gallery purged');
  return { items: items.length, bytes };
}

/**
 * Gallery retention (P5-T12): backfills missing expiry dates, warns hosts 14
 * days out (once per 30 days), and purges expired galleries — rows plus
 * every derivative (avif/webp twins, `.wm` originals). Guestbook messages
 * survive (text is cheap); the gallery shell stays for re-uploads.
 */
export async function handleRetention(log: Log, tools: RetentionTools = {}): Promise<{ status: string }> {
  const store = privateStorage(tools.storagePrivate);
  const email = tools.email ?? providers().email;
  const now = tools.now ?? new Date();

  const galleries = await prisma.gallery.findMany({
    select: {
      id: true,
      plan: true,
      itemLimit: true,
      expiresAt: true,
      event: { select: { endsAt: true, startsAt: true, name: true, createdById: true } },
    },
    take: 200,
  });

  let warned = 0;
  let purged = 0;
  for (const gallery of galleries) {
    const plan = gallery.plan === 'PLUS' ? 'PLUS' : 'FREE';
    if (!gallery.expiresAt) {
      // updateMany: a concurrent suite may have removed the gallery; zero
      // matched rows just means there is nothing to backfill.
      await prisma.gallery.updateMany({
        where: { id: gallery.id, expiresAt: null },
        data: {
          expiresAt: expiryFor(gallery.event, plan, now),
          itemLimit: Math.max(gallery.itemLimit, planLimits(plan).items),
        },
      });
      continue;
    }
    const daysLeft = Math.ceil((gallery.expiresAt.getTime() - now.getTime()) / 86400000);
    if (daysLeft < 0) {
      const result = await purgeGallery(store, gallery.id, log);
      purged += result.items;
      continue;
    }
    if (daysLeft <= WARN_DAYS && !(await warnedRecently(gallery.id))) {
      const host = await prisma.user.findUnique({
        where: { id: gallery.event.createdById },
        select: { name: true, email: true },
      });
      if (host?.email) {
        const dateLabel = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(gallery.expiresAt);
        await email
          .send({
            to: host.email,
            subject: `Your event photos expire soon: ${gallery.event.name}`,
            react: createElement(ExpiryEmail, {
              guestName: host.name ?? 'there',
              eventName: gallery.event.name,
              expiryDate: dateLabel,
              downloadUrl: null,
            }),
          })
          .catch(() => undefined);
        await auditSystem('Gallery', gallery.id, 'media.expiryWarned', { daysLeft });
        warned += 1;
      }
    }
  }
  return { status: `warned:${warned} purged:${purged}` };
}
