import { completeUpload, completeUploadSchema } from '@tiwa/core';
import { NextResponse } from 'next/server';
import { privateStorage } from '@/lib/storage.js';
import { actorFromRequest } from '../_auth.js';
import { coreErrorResponse } from '@/lib/api-error.js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/uploads/complete — finish the multipart upload, verify the
 * object exists, move the item to PROCESSING and enqueue the worker
 * (media/process-image or media/process-video via the outbox).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const input = completeUploadSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  }
  const actor = await actorFromRequest(request, { mediaId: input.data.mediaId });
  if (!actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  try {
    const result = await completeUpload(privateStorage(), actor, input.data);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return coreErrorResponse(error);
  }
}
