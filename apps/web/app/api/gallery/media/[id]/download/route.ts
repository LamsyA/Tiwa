import { prisma } from '@tiwa/db';
import { NextResponse, type NextRequest } from 'next/server';
import { galleryViewerFromRequest } from '@/lib/gallery-viewer.js';
import { privateStorage } from '@/lib/storage.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/gallery/media/{id}/download — single-photo download (MOM-15).
 * Hosts toggle it per gallery; members always can. Redirects to a short
 * signed URL with an attachment filename — keys never leak.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = new URL(request.url).searchParams.get('access') ?? undefined;
  const item = await prisma.mediaItem.findUnique({
    where: { id },
    include: { gallery: { select: { id: true, code: true, privacy: true, guestDownloads: true, eventId: true } } },
  });
  if (!item || item.deletedAt || item.state !== 'PUBLISHED') {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
  const { getGalleryPage } = await import('@tiwa/core');
  const { viewer, sessionIds } = await galleryViewerFromRequest(request);
  const galleryPage = await getGalleryPage(item.gallery.code, viewer, {
    ...(access ? { accessCode: access } : {}),
    ...(sessionIds.length > 0 ? { sessionIds } : {}),
  }).catch(() => null);
  if (!galleryPage) return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  const allowed = item.gallery.guestDownloads || galleryPage.isMember;
  if (!allowed) return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });

  const key = item.largeKey ?? item.thumbKey ?? item.originalKey;
  const filename = key.split('/').pop() ?? `${item.id}.bin`;
  const url = await privateStorage().getSignedUrl(key, 3600, filename);
  return NextResponse.redirect(url, 302);
}
