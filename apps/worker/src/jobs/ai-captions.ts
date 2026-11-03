import { assistantFromEnv, type Captioner } from '@tiwa/ai';
import { env } from '@tiwa/config';
import { aiUsageRecorder, captionPendingMedia, createLogger } from '@tiwa/core';
import { S3Storage, type Storage } from '@tiwa/storage';
import sharp from 'sharp';

type Log = ReturnType<typeof createLogger>;

/** Moments alt text (P15-T06, AI-05): every 10 minutes, caption new photos that have none. */
export const AI_CAPTIONS_JOB = 'ai/captions' as const;
export const AI_CAPTIONS_EVERY_MS = 10 * 60 * 1000;

function publicStorage(): Storage {
  return new S3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET_PUBLIC,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
}

/** The thumbnail as a small JPEG data: URL (models take JPEG; our renditions are AVIF/WebP). */
export function imageReader(store: Storage) {
  return async (item: { thumbKey: string | null; largeKey: string | null }): Promise<string | null> => {
    const key = item.thumbKey ?? item.largeKey;
    if (!key) return null;
    const object = await store.get(key);
    if (!object) return null;
    const jpeg = await sharp(object.body).resize(512, 512, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  };
}

export async function handleAiCaptions(
  log: Log,
  tools: { captioner?: Captioner; store?: Storage } = {},
): Promise<{ captioned: number; skipped: number }> {
  const captioner = tools.captioner ?? assistantFromEnv(env, aiUsageRecorder(null, null));
  const result = await captionPendingMedia(captioner, imageReader(tools.store ?? publicStorage()));
  if (result.captioned > 0) log.info({ topic: AI_CAPTIONS_JOB, ...result }, 'photos captioned');
  return result;
}
