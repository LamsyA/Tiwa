import { listGalleryMedia } from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { galleryViewerFromRequest } from '@/lib/gallery-viewer.js';
import { withSignedUrls } from '@/lib/gallery-urls.js';
import { checkRedisRateLimit } from '@/lib/rate-store.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/gallery/{code}/media?album=GUEST&cursor=&limit=&access=
 * Cursor window of published items with per-item signed view URLs. Same
 * privacy gate as the page: GUESTS_ONLY needs a member session, a guest
 * session cookie, or the access code.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipCheck = await checkRedisRateLimit(`gallery:media:ip:${ip}`, 60, 60);
  if (!ipCheck.allowed) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED' } }, { status: 429 });
  }
  const url = new URL(request.url);
  const album = url.searchParams.get('album') === 'OFFICIAL' ? ('OFFICIAL' as const) : ('GUEST' as const);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 60, 1), 100);
  const accessCode = url.searchParams.get('access') ?? undefined;

  const { getGalleryPage } = await import('@tiwa/core');
  const { viewer, sessionIds } = await galleryViewerFromRequest(request);
  let galleryId: string;
  try {
    const page = await getGalleryPage(code, viewer, {
      ...(accessCode ? { accessCode } : {}),
      ...(sessionIds.length > 0 ? { sessionIds } : {}),
    });
    galleryId = page.gallery.id;
  } catch (error) {
    const code_ = (error as { code?: string }).code ?? 'FORBIDDEN';
    const status = code_ === 'NOT_FOUND' ? 404 : 403;
    return NextResponse.json({ ok: false, error: { code: code_ } }, { status });
  }

  const window = await listGalleryMedia(galleryId, viewer, { album, ...(cursor ? { cursor } : {}), limit });
  const items = await withSignedUrls(
    window.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
  );
  return NextResponse.json({ ok: true, data: { items, nextCursor: window.nextCursor } });
}
