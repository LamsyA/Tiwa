import { createUpload, createUploadSchema } from '@tiwa/core';
import { RATE_LIMITS } from '@tiwa/core/auth/rate-limit';
import { NextResponse } from 'next/server';
import { checkRedisRateLimit } from '@/lib/rate-store.js';
import { privateStorage } from '@/lib/storage.js';
import { actorFromRequest, ipOf } from '../_auth.js';
import { coreErrorResponse } from '@/lib/api-error.js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/uploads/create — open a browser-direct multipart upload.
 * Logged-in members use their session; guests present a signed session
 * cookie (tiwa_gs_{galleryId}) issued by the gallery page. Rate limited
 * per IP and per user (Backend.md §13 family).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const input = createUploadSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  }
  const ipCheck = await checkRedisRateLimit(
    `uploads:create:ip:${ipOf(request)}`,
    RATE_LIMITS.uploadCreatePerIp.limit,
    RATE_LIMITS.uploadCreatePerIp.windowSec,
  );
  if (!ipCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: { code: 'RATE_LIMITED', retryAfterSec: ipCheck.retryAfterSec } },
      { status: 429 },
    );
  }
  const actor = await actorFromRequest(request, { eventId: input.data.eventId });
  if (!actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  if (actor.kind === 'user') {
    const userCheck = await checkRedisRateLimit(
      `uploads:create:user:${actor.userId}`,
      RATE_LIMITS.uploadCreatePerUser.limit,
      RATE_LIMITS.uploadCreatePerUser.windowSec,
    );
    if (!userCheck.allowed) {
      return NextResponse.json(
        { ok: false, error: { code: 'RATE_LIMITED', retryAfterSec: userCheck.retryAfterSec } },
        { status: 429 },
      );
    }
  }
  try {
    const result = await createUpload(privateStorage(), actor, input.data);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return coreErrorResponse(error);
  }
}
