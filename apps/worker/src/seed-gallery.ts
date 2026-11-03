import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { deflateSync } from 'node:zlib';
import { env } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { S3Storage } from '@tiwa/storage';

/**
 * `pnpm seed:gallery` — object bytes for the seeded galleries (P5-T13).
 * `pnpm db:seed` plants rows + keys; this fills S3Mock with matching PNGs
 * (hand-rolled writer, no native deps) and ffmpeg test-src clips. Safe to
 * re-run: keys are deterministic, puts overwrite.
 */

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = (CRC_TABLE[(crc ^ bytes[i]!) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function solidPng(width: number, height: number, hue: number): Uint8Array {
  const [r, g, b] = hsl(hue % 360, 0.55, 0.55);
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const t = 0.65 + (0.35 * y) / height;
    raw[y * stride] = 0;
    for (let x = 0; x < width; x += 1) {
      const wobble = (x * 7 + y * 13) % 11;
      raw[y * stride + 1 + x * 3] = Math.min(255, Math.round(r * t) + wobble);
      raw[y * stride + 1 + x * 3 + 1] = Math.min(255, Math.round(g * t) + wobble);
      raw[y * stride + 1 + x * 3 + 2] = Math.min(255, Math.round(b * t) + wobble);
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

const execFileAsync = promisify(execFile);

async function ffmpegClip(): Promise<Uint8Array | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=320x240:rate=10:duration=2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        'frag_keyframe+empty_moov',
        '-an',
        '-f',
        'mp4',
        'pipe:1',
      ],
      { timeout: 60_000, maxBuffer: 16 * 1024 * 1024, encoding: 'buffer' },
    );
    return new Uint8Array(stdout as Buffer);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const store = new S3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET_PRIVATE,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
  const galleries = await prisma.gallery.findMany({
    where: { code: { in: ['MOMSDEMO', 'LOAD5000'] } },
    select: { id: true, code: true },
  });
  let puts = 0;
  for (const gallery of galleries) {
    const items = await prisma.mediaItem.findMany({
      where: { galleryId: gallery.id, state: { in: ['PUBLISHED', 'PENDING_REVIEW'] } },
      select: { originalKey: true, thumbKey: true, largeKey: true, sizeBytes: true },
      take: 500,
    });
    for (const item of items) {
      let hue = 0;
      for (let i = 0; i < item.originalKey.length; i += 1) hue = (hue * 31 + item.originalKey.charCodeAt(i)) % 360;
      const files: [string | null, Uint8Array, string][] = [
        [item.originalKey, solidPng(640, 480, hue), 'image/png'],
        [item.thumbKey, solidPng(320, 240, hue), 'image/png'],
        [item.largeKey, solidPng(960, 720, hue), 'image/png'],
      ];
      for (const [key, body, type] of files) {
        if (!key) continue;
        try {
          await store.put(key, body, type);
          puts += 1;
        } catch (error) {
          console.warn(`[seed:gallery] put failed for ${key} — is S3Mock up?`, (error as Error).message);
          return;
        }
      }
    }
    const videos = await prisma.mediaItem.findMany({
      where: { galleryId: gallery.id, kind: 'VIDEO' },
      select: { originalKey: true },
    });
    if (videos.length > 0) {
      const clip = await ffmpegClip();
      if (!clip) {
        console.warn('[seed:gallery] ffmpeg unavailable — skipping video bytes.');
      } else {
        for (const video of videos) {
          try {
            await store.put(video.originalKey, clip, 'video/mp4');
            puts += 1;
          } catch (error) {
            console.warn(`[seed:gallery] put failed for ${video.originalKey}`, (error as Error).message);
            return;
          }
        }
      }
    }
  }
  console.log(`[seed:gallery] uploaded ${puts} objects.`);
  await prisma.$disconnect();
}

await main().catch((error: unknown) => {
  console.error('[seed:gallery] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
