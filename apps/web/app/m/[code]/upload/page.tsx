import { getTranslations } from 'next-intl/server';
import { GuestShell, buttonClasses } from '@tiwa/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ClaimInvite } from '@/components/moments/claim-invite.js';
import { UploadSheet } from '@/components/moments/upload-sheet.js';
import { galleryViewer } from '@/lib/gallery-viewer.js';
import { getGalleryPage, type GalleryViewer } from '@tiwa/core';

export const dynamic = 'force-dynamic';

/**
 * UF-10 guest upload sheet: name + consent on first upload, then the
 * UploadQueueProvider picker (MIXED photos/video, Web Worker resize,
 * resumable multipart). Invite holders arrive via `?guest=` and skip both
 * the access code and the name form.
 */
export default async function UploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ access?: string; guest?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const access = (query.access ?? '').trim();
  const guestToken = (query.guest ?? '').trim() || undefined;
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
    if (guestToken) {
      // Invite holders land here first: claim the session, then reload.
      return (
        <GuestShell title={t('uploadTitle')}>
          <ClaimInvite code={code} token={guestToken} album="GUEST" />
        </GuestShell>
      );
    }
    // Locked galleries send guests back to unlock on the gallery page.
    redirect(`/m/${code}`);
  }

  return (
    <GuestShell
      title={t('uploadTitle')}
      action={
        <Link href={`/m/${page.gallery.code}`} className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
          {t('backToGallery')}
        </Link>
      }
    >
      <UploadSheet
        code={page.gallery.code}
        eventId={page.event.id}
        galleryId={page.gallery.id}
        access={access}
        moderation={page.gallery.moderation}
        sessionName={null}
        hasSession={page.sessionId !== null || page.isMember}
      />
      {guestToken && !page.sessionId && !page.isMember && (
        <div className="mt-2">
          <ClaimInvite code={page.gallery.code} token={guestToken} album="GUEST" />
        </div>
      )}
    </GuestShell>
  );
}
