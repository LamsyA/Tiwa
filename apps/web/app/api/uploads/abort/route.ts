import { abortUpload, abortUploadSchema } from '@tiwa/core';
import { NextResponse } from 'next/server';
import { privateStorage } from '@/lib/storage.js';
import { actorFromRequest } from '../_auth.js';
import { coreErrorResponse } from '@/lib/api-error.js';

export const dynamic = 'force-dynamic';

/** POST /api/uploads/abort — abort the multipart upload and drop the UPLOADING row. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const input = abortUploadSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  }
  const actor = await actorFromRequest(request, { mediaId: input.data.mediaId });
  if (!actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  try {
    const result = await abortUpload(privateStorage(), actor, input.data);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return coreErrorResponse(error);
  }
}
