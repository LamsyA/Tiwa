import { RATE_LIMITS } from '@tiwa/core/auth/rate-limit';
import convert from 'heic-convert';
import { NextResponse } from 'next/server';
import { checkRedisRateLimit } from '@/lib/rate-store.js';
import { ipOf } from '../_auth.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Vercel caps request bodies at 4.5 MB; phone HEIC photos are usually 1–3 MB. */
const MAX_INPUT_BYTES = 4 * 1024 * 1024;

/** ISO-BMFF "ftyp" box with a HEIF/HEIC brand. */
function isHeif(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const box = String.fromCharCode(...bytes.slice(4, 8));
  const brand = String.fromCharCode(...bytes.slice(8, 12));
  return box === 'ftyp' && ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand);
}

/**
 * POST /api/uploads/convert — server-side fallback (D-X83). When a browser
 * cannot read a photo (an iPhone HEIC on Chrome/Android), it sends the raw
 * file here; we return a 95%-quality JPEG the browser CAN read, and the usual
 * on-device compressor then brings it under 800 KB. Nothing is stored.
 */
export async function POST(request: Request) {
  const limit = await checkRedisRateLimit(
    `uploads:convert:ip:${ipOf(request)}`,
    RATE_LIMITS.uploadCreatePerIp.limit,
    RATE_LIMITS.uploadCreatePerIp.windowSec,
  );
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED' } }, { status: 429 });
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_INPUT_BYTES) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION', key: 'tooLarge' } }, { status: 413 });
  }
  const input = new Uint8Array(await request.arrayBuffer());
  if (input.length === 0 || input.length > MAX_INPUT_BYTES) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION', key: 'tooLarge' } }, { status: 413 });
  }
  if (!isHeif(input)) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION', key: 'unsupportedType' } }, { status: 415 });
  }
  try {
    const jpeg = await convert({ buffer: input, format: 'JPEG', quality: 0.95 });
    return new NextResponse(new Uint8Array(jpeg), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION', key: 'unsupportedType' } }, { status: 422 });
  }
}
