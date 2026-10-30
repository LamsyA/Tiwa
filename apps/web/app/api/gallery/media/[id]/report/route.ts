import { requestMediaRemoval, requestRemovalSchema } from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { galleryViewerFromRequest } from '@/lib/gallery-viewer.js';
import { coreErrorResponse } from '@/lib/api-error.js';
import { checkRedisRateLimit } from '@/lib/rate-store.js';

export const dynamic = 'force-dynamic';

/** POST /api/gallery/media/{id}/report — request removal of a photo of yourself (MOM-17). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipCheck = await checkRedisRateLimit(`gallery:report:ip:${ip}`, 20, 3600);
  if (!ipCheck.allowed) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED' } }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as unknown;
  const input = requestRemovalSchema.safeParse({ ...((body ?? {}) as Record<string, unknown>), mediaId: id });
  if (!input.success) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  }
  const { viewer, sessionIds } = await galleryViewerFromRequest(request);
  try {
    const result = await requestMediaRemoval(viewer, { ...input.data, sessionIds });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return coreErrorResponse(error);
  }
}
