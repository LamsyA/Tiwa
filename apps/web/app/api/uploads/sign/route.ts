import { signS3Upload, signUploadSchema } from '@tiwa/core';
import { RATE_LIMITS } from '@tiwa/core/auth/rate-limit';
import { NextResponse } from 'next/server';
import { checkRedisRateLimit } from '@/lib/rate-store.js';
import { privateStorage } from '@/lib/storage.js';
import { actorForUpload, ipOf } from '../_auth.js';
import { coreErrorResponse } from '@/lib/api-error.js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/uploads/sign — one S3 presigned URL for a browser-driven
 * multipart step (used with @uppy/aws-s3 `signRequest`). The gallery id is
 * recovered from the key path, so the body carries no trust: auth comes from
 * the session/cookie and core re-verifies ownership per call.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const input = signUploadSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  }
  const ipCheck = await checkRedisRateLimit(
    `uploads:part:ip:${ipOf(request)}`,
    RATE_LIMITS.uploadPartPerIp.limit,
    RATE_LIMITS.uploadPartPerIp.windowSec,
  );
  if (!ipCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: { code: 'RATE_LIMITED', retryAfterSec: ipCheck.retryAfterSec } },
      { status: 429 },
    );
  }
  const actor = await actorForUpload(request, { key: input.data.key });
  if (!actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  try {
    const result = await signS3Upload(privateStorage(), actor, input.data);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return coreErrorResponse(error);
  }
}
