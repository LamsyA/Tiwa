import { env } from '@tiwa/config';
import { getGalleryPage, listSlideshowFeed, type GalleryViewer } from '@tiwa/core';
import { QRCode } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SlideshowPlayer } from '@/components/moments/slideshow.js';
import { galleryViewer } from '@/lib/gallery-viewer.js';
import { withSignedUrls } from '@/lib/gallery-urls.js';
import { EmptyState } from '@tiwa/ui';

export const dynamic = 'force-dynamic';

/**
 * UF-12: venue slideshow — full-screen autoplay at the host's delay with
 * crossfade, wake lock, corner QR joining the gallery, and a reduced-motion
 * fallback. The same guests-only gate as `/m/{code}`; the player re-polls
 * the feed so moderation lands within seconds.
 */
export default async function SlideshowPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ access?: string; guest?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const access = (query.access ?? '').trim();
  const t = await getTranslations('gallery');

  const { viewer, sessionIds } = await galleryViewer();
  let page: Awaited<ReturnType<typeof getGalleryPage>>;
  try {
    page = await getGalleryPage(code, viewer as GalleryViewer, {
      ...(access ? { accessCode: access } : {}),
      ...(sessionIds.length > 0 ? { sessionIds } : {}),
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    // Locked slideshows send guests to unlock on the gallery page.
    redirect(`/m/${code}${access ? `?access=${encodeURIComponent(access)}` : ''}`);
  }

  const feed = await listSlideshowFeed(page.gallery.id);
  const items = await withSignedUrls(feed.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })));
  const galleryUrl = `${env.APP_URL.replace(/\/$/, '')}/m/${page.gallery.code}`;

  if (items.length === 0) {
    return (
      <div data-theme="dark" className="bg-black fixed inset-0 z-50 flex items-center justify-center p-6 text-white">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <EmptyState title={t('slideshow')} body={t('slideshowEmpty')} />
          <Link href={`/m/${page.gallery.code}`} className="text-sm text-white/80 underline">
            {t('backToGalleryLink')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black fixed inset-0 text-white">
      <SlideshowPlayer
        code={page.gallery.code}
        access={access}
        initialItems={items.map((item) => ({
          id: item.id,
          kind: item.kind,
          durationSec: item.durationSec,
          thumbUrl: item.thumbUrl,
          largeUrl: item.largeUrl,
          posterUrl: item.posterUrl,
          featured: item.featured,
        }))}
        delaySec={page.gallery.slideshowDelaySec}
      />
      {/* Corner QR (no JS): guests scan to open the gallery and add photos. */}
      <div className="absolute bottom-3 right-3 z-50 flex flex-col items-center gap-1 rounded-lg bg-white p-2 text-black">
        <QRCode value={galleryUrl} size={88} label={t('scanToAdd')} />
        <span className="max-w-24 text-center text-[10px] leading-tight">{t('scanToAdd')}</span>
      </div>
      <Link
        href={`/m/${page.gallery.code}`}
        className="absolute left-3 top-3 z-50 rounded-full bg-white/10 px-3 py-2 text-sm text-white"
      >
        ← {t('backToGalleryLink')}
      </Link>
    </div>
  );
}
