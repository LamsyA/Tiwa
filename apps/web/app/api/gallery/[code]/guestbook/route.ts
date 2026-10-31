import { listGuestbookMessages, postGuestbookMessage } from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { galleryViewerFromRequest } from '@/lib/gallery-viewer.js';
import { checkRedisRateLimit } from '@/lib/rate-store.js';
import { galleryChannel, publishLive } from '@/lib/live.js';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  name: z.string().trim().max(80).optional(),
  body: z.string().trim().min(1).max(500),
  access: z.string().trim().max(12).optional(),
});

/** GET /api/gallery/{code}/guestbook — public wall (hidden rows stay server-side). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const access = new URL(request.url).searchParams.get('access') ?? undefined;
  const { getGalleryPage } = await import('@tiwa/core');
  const { viewer, sessionIds } = await galleryViewerFromRequest(request);
  let galleryId: string;
  try {
    const page = await getGalleryPage(code, viewer, {
      ...(access ? { accessCode: access } : {}),
      ...(sessionIds.length > 0 ? { sessionIds } : {}),
    });
    galleryId = page.gallery.id;
  } catch (error) {
    const errorCode = (error as { code?: string }).code ?? 'FORBIDDEN';
    return NextResponse.json(
      { ok: false, error: { code: errorCode } },
      { status: errorCode === 'NOT_FOUND' ? 404 : 403 },
    );
  }
  const wall = await listGuestbookMessages(galleryId);
  return NextResponse.json({
    ok: true,
    data: { messages: wall.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) },
  });
}

/** POST /api/gallery/{code}/guestbook — sign the wall (same gate as viewing). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipCheck = await checkRedisRateLimit(`gallery:guestbook:ip:${ip}`, 20, 3600);
  if (!ipCheck.allowed) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED' } }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as unknown;
  const input = postSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  }
  const { viewer, sessionIds } = await galleryViewerFromRequest(request);
  try {
    const result = await postGuestbookMessage(viewer, {
      code,
      name: input.data.name,
      body: input.data.body,
      ...(input.data.access ? { access: input.data.access } : {}),
      sessionIds,
    });
    const { getGalleryPage } = await import('@tiwa/core');
    try {
      const page = await getGalleryPage(code, viewer, { sessionIds });
      await publishLive(galleryChannel(page.gallery.id), 'gallery');
    } catch {
      // Gate already passed once; never fail the post on the notice.
    }
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const errorCode = (error as { code?: string }).code ?? 'FORBIDDEN';
    return NextResponse.json(
      { ok: false, error: { code: errorCode } },
      { status: errorCode === 'NOT_FOUND' ? 404 : 403 },
    );
  }
}
