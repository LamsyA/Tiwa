import { GuestEnquiries } from '@/components/chat/guest-enquiries.js';
import { getTranslations } from 'next-intl/server';
import { GuestShell, buttonClasses } from '@tiwa/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GalleryGrid } from '@/components/moments/gallery-grid.js';
import { GalleryLivePill } from '@/components/moments/gallery-live.js';
import { GuestbookPanel } from '@/components/moments/guestbook.js';
import { galleryViewer } from '@/lib/gallery-viewer.js';
import { withSignedUrls } from '@/lib/gallery-urls.js';
import { privateStorage } from '@/lib/storage.js';
import { getGalleryPage, listGalleryMedia, type GalleryViewer } from '@tiwa/core';
import { ClaimInvite } from '@/components/moments/claim-invite.js';

export const dynamic = 'force-dynamic';

function formatDay(iso: string | null, timezone: string, locale = 'en-NG'): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: timezone }).format(new Date(iso));
}

/**
 * UF-10: public Moments gallery — Official/Guest tabs with counts, virtualised
 * grid, lightbox, "My uploads", delete-own + request-removal, live new-items
 * pill (SSE `gallery:{id}`), and guests-only privacy (invite session via
 * `?guest=`, or printed access code). Server-rendered shell + signed URLs.
 */
export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ album?: string; access?: string; guest?: string; tab?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const album = query.album === 'OFFICIAL' ? ('OFFICIAL' as const) : ('GUEST' as const);
  const access = (query.access ?? '').trim();
  const guestToken = (query.guest ?? '').trim() || undefined;
  const showGuestbook = query.tab === 'guestbook';
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
    if ((error as { code?: string }).code === 'FORBIDDEN') {
      return (
        <GuestShell title={t('guestsOnlyHeading')}>
          {guestToken && <ClaimInvite code={code} token={guestToken} album={album} />}
          <p className="text-muted text-sm">{t('guestsOnlyHint')}</p>
          <form method="get" className="mt-4 flex gap-2">
            <label htmlFor="gallery-access" className="sr-only">
              {t('accessCode')}
            </label>
            <input
              id="gallery-access"
              name="access"
              autoComplete="off"
              placeholder={t('accessCodePlaceholder')}
              className="border-border bg-bg text-text h-11 flex-1 rounded-xl border px-3 text-base uppercase"
            />
            <button type="submit" className={buttonClasses({ variant: 'primary' })}>
              {t('unlock')}
            </button>
          </form>
        </GuestShell>
      );
    }
    throw error;
  }

  const window = showGuestbook
    ? { items: [], nextCursor: null as string | null }
    : await listGalleryMedia(page.gallery.id, viewer as GalleryViewer, { album, limit: 60 });
  const items = await withSignedUrls(
    window.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
  );
  const { listGuestbookMessages } = await import('@tiwa/core');
  const wall = showGuestbook ? await listGuestbookMessages(page.gallery.id) : { messages: [] };

  const coverUrl = page.event.coverKey
    ? await privateStorage()
        .getSignedUrl(page.event.coverKey, 3600)
        .catch(() => null)
    : null;
  const day = formatDay(page.event.startsAt?.toISOString() ?? null, page.event.timezone);
  const baseParams = access ? `?access=${encodeURIComponent(access)}` : '';
  const coverAlt = page.event.name;

  return (
    <GuestShell
      title={page.event.name}
      cover={coverUrl ? <img src={coverUrl} alt={coverAlt} className="size-full object-cover" /> : undefined}
      coverAlt={coverAlt}
      action={
        <Link
          href={`/m/${page.gallery.code}/upload${baseParams}`}
          className={buttonClasses({ variant: 'primary', fullWidth: true })}
        >
          {t('addPhotos')}
        </Link>
      }
      footerNote={page.gallery.showFooter ? <span>{t('plannedWith')}</span> : undefined}
    >
      <GalleryLivePill galleryId={page.gallery.id} access={access} />
      {guestToken && !page.sessionId && !page.isMember && (
        <ClaimInvite code={page.gallery.code} token={guestToken} album={album} />
      )}
      {day && <p className="text-muted text-sm">{day}</p>}
      <nav aria-label={t('albums')} className="mt-3 flex gap-2">
        {(['OFFICIAL', 'GUEST'] as const).map((tab) => {
          const active = tab === album && !showGuestbook;
          const count = tab === 'OFFICIAL' ? page.counts.official : page.counts.guest;
          return (
            <Link
              key={tab}
              href={`/m/${page.gallery.code}?album=${tab}${access ? `&access=${encodeURIComponent(access)}` : ''}`}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold'
                  : 'rounded-full px-4 py-2 text-sm text-muted'
              }
            >
              {tab === 'OFFICIAL' ? t('official') : t('guests')} · {count}
            </Link>
          );
        })}
        <Link
          href={`/m/${page.gallery.code}?tab=guestbook${access ? `&access=${encodeURIComponent(access)}` : ''}`}
          aria-current={showGuestbook ? 'page' : undefined}
          className={
            showGuestbook
              ? 'rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold'
              : 'rounded-full px-4 py-2 text-sm text-muted'
          }
        >
          {t('guestbookTab')}
        </Link>
      </nav>
      <div className="mt-3">
        {showGuestbook ? (
          <GuestbookPanel
            code={page.gallery.code}
            access={access}
            initialMessages={wall.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
          />
        ) : (
          <GalleryGrid
            key={`${page.gallery.id}-${album}`}
            code={page.gallery.code}
            album={album}
            access={access}
            canDownload={page.gallery.guestDownloads || page.isMember}
            initialItems={items}
            initialCursor={window.nextCursor}
          />
        )}
      </div>
      <GuestEnquiries galleryId={page.gallery.id} />
    </GuestShell>
  );
}
