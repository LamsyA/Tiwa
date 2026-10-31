import { listSlideshowFeed } from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { galleryViewerFromRequest } from '@/lib/gallery-viewer.js';
import { withSignedUrls } from '@/lib/gallery-urls.js';
import { checkRedisRateLimit } from '@/lib/rate-store.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/gallery/{code}/slideshow?access= — featured-first feed with
 * signed URLs. The player polls this so host moderation lands within
 * seconds (UF-11-1). Same privacy gate as the gallery page.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipCheck = await checkRedisRateLimit(`gallery:slideshow:ip:${ip}`, 60, 60);
  if (!ipCheck.allowed) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED' } }, { status: 429 });
  }
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

  const feed = await listSlideshowFeed(galleryId);
  const items = await withSignedUrls(feed.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })));
  return NextResponse.json({ ok: true, data: { items } });
}
