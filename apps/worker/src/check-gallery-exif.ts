import { S3Storage } from '@tiwa/storage';
import { prisma } from '@tiwa/db';
import sharp from 'sharp';

/**
 * GATE P5: no GPS EXIF in any served gallery file (UF-10-3).
 * Reads every PUBLISHED derivative of the seeded MOMSDEMO gallery straight
 * from S3 (the same bytes the signed URLs serve) and fails on any EXIF
 * APP1 marker. Sharp strips metadata by default; this guards regressions.
 * Usage: `pnpm --filter @tiwa/worker check:exif` (needs db:seed + S3Mock up).
 */
const CODE = process.env.SEED_GALLERY_CODE ?? 'MOMSDEMO';
const LIMIT = Number(process.env.SEED_GALLERY_CHECK_LIMIT ?? 500);

async function main(): Promise<void> {
  const store = new S3Storage({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9090',
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET_PRIVATE ?? 'tiwa-media-private',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'test',
  });

  const gallery = await prisma.gallery.findUniqueOrThrow({ where: { code: CODE }, select: { id: true } });
  const items = await prisma.mediaItem.findMany({
    where: { galleryId: gallery.id, deletedAt: null, state: 'PUBLISHED', kind: 'PHOTO' },
    select: { id: true, thumbKey: true, largeKey: true, originalKey: true },
    take: LIMIT,
  });
  console.log(`[exif-check] scanning ${items.length} published photos of /m/${CODE}`);

  const EXIF = Buffer.from('Exif\0\0', 'ascii');
  const GPS = Buffer.from('GPS', 'ascii');
  let failures = 0;
  for (const item of items) {
    for (const key of [item.thumbKey, item.largeKey, item.originalKey]) {
      if (!key) continue;
      const file = await store.get(key).catch(() => null);
      if (!file) {
        console.warn(`[exif-check] missing object (seed without storage?): ${key}`);
        continue;
      }
      const body = Buffer.from(file.body);
      if (body.includes(EXIF)) {
        console.error(`[exif-check] FAIL: EXIF marker in ${key}`);
        failures += 1;
        continue;
      }
      if (body.includes(GPS)) {
        console.error(`[exif-check] FAIL: GPS tag in ${key}`);
        failures += 1;
        continue;
      }
      const meta = await sharp(body, { failOn: 'none' })
        .metadata()
        .catch(() => null);
      if (meta?.exif) {
        console.error(`[exif-check] FAIL: sharp reports exif segment in ${key}`);
        failures += 1;
      }
    }
  }
  await prisma.$disconnect();
  if (failures > 0) {
    console.error(`[exif-check] ${failures} file(s) with EXIF/GPS — see above.`);
    process.exit(1);
  }
  console.log('[exif-check] ok: no EXIF/GPS markers in served derivatives.');
}

await main();
