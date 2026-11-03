import { env } from '@tiwa/config';
import {
  getMomentsDashboard,
  listGuestbookMessagesForHost,
  listOpenMediaReports,
  listPendingMedia,
  listPublishedMedia,
  authorize,
} from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Card, StatCard, buttonClasses, Banner } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { withSignedUrls } from '@/lib/gallery-urls.js';
import { privateStorage } from '@/lib/storage.js';
import { MomentsQrCard } from './moments-qr.js';
import { MomentsSettingsForm } from './moments-settings.js';
import { ModerationQueue } from './moderation-queue.js';
import { OfficialAlbumPanel } from './official-album.js';
import { HostGuestbook } from './host-guestbook.js';
import { ZipPanel } from './zip-panel.js';

/** P5-T08 / Frontend.md §6.3: host Moments page — settings, QR, queue, stats. */
export default async function HostMomentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(id, '/moments');
  const t = await getTranslations('events.momentsPage');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    select: { name: true, momentsEnabled: true, timezone: true },
  });
  const formatDay = (at: Date): string =>
    new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeZone: event.timezone }).format(at);

  const canModerate = (() => {
    try {
      authorize(ctx.actor, 'moments.moderate', { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  })();
  const canUploadOfficial = (() => {
    try {
      authorize(ctx.actor, 'moments.upload.official', { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  })();

  if (!allowed || !canModerate || !event.momentsEnabled || !momentsOn) {
    return (
      <EventFrame
        eventId={id}
        userId={ctx.actor.userId}
        access={access}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
        active="moments"
        title={event.name}
      >
        <div className="flex flex-col gap-4 py-2">
          <h2 className="font-display text-xl font-bold">{t('title')}</h2>
          <Forbidden eventId={id} />
        </div>
      </EventFrame>
    );
  }

  const [dashboard, pendingPage, publishedPage, reported, wall] = await Promise.all([
    getMomentsDashboard(ctx.actor, id, access),
    listPendingMedia(ctx.actor, id, { limit: 60 }, access),
    listPublishedMedia(ctx.actor, id, { limit: 60 }, access),
    listOpenMediaReports(ctx.actor, id, access),
    listGuestbookMessagesForHost(ctx.actor, id, access),
  ]);
  const base = env.APP_URL.replace(/\/$/, '');
  const galleryUrl = `${base}/m/${dashboard.gallery.code}`;
  const storage = privateStorage();
  const [pending, published, reports] = await Promise.all([
    withSignedUrls(pendingPage.items),
    withSignedUrls(publishedPage.items),
    Promise.all(
      reported.reports.map(async (report) => ({
        id: report.id,
        reason: report.reason,
        createdAt: report.createdAt.toISOString(),
        reporterLabel: report.reporterLabel,
        item: report.item
          ? {
              id: report.item.id,
              album: report.item.album,
              kind: report.item.kind,
              state: report.item.state,
              createdAt: report.item.createdAt.toISOString(),
              uploaderLabel: report.item.uploaderLabel,
              featured: report.item.featured,
              thumbUrl: report.item.thumbKey ? await storage.getSignedUrl(report.item.thumbKey, 3600) : null,
              largeUrl: report.item.largeKey ? await storage.getSignedUrl(report.item.largeKey, 3600) : null,
            }
          : null,
      })),
    ),
  ]);

  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
      active="moments"
      title={event.name}
    >
      <div className="flex flex-col gap-4 py-2">
        <h2 className="font-display text-xl font-bold">{t('title')}</h2>
        {dashboard.gallery.expiresAt && (
          <Banner tone={dashboard.gallery.daysLeft !== null && dashboard.gallery.daysLeft < 14 ? 'warning' : 'info'}>
            {dashboard.gallery.daysLeft !== null && dashboard.gallery.daysLeft < 14
              ? t('expiryWarning', { date: formatDay(dashboard.gallery.expiresAt) })
              : t('expiryBanner', {
                  date: formatDay(dashboard.gallery.expiresAt),
                  used: dashboard.counts.total,
                  limit: dashboard.gallery.itemLimit,
                })}
          </Banner>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label={t('statsItems')} value={dashboard.counts.total} />
          <StatCard label={t('statsPending')} value={dashboard.counts.pending} />
          <StatCard label={t('statsUploaders')} value={dashboard.counts.uploaders} />
          <StatCard label={t('statsReported')} value={dashboard.counts.reported} />
        </div>
        <MomentsSettingsForm
          eventId={id}
          initial={{
            privacy: dashboard.gallery.privacy,
            moderation: dashboard.gallery.moderation,
            slideshowDelaySec: dashboard.gallery.slideshowDelaySec,
            guestDownloads: dashboard.gallery.guestDownloads,
            showFooter: dashboard.gallery.showFooter,
            accessCode: dashboard.gallery.accessCode,
          }}
          canEdit
          plan={dashboard.gallery.plan}
        />
        <MomentsQrCard eventName={event.name} galleryUrl={galleryUrl} />
        {canUploadOfficial && <OfficialAlbumPanel eventId={id} galleryId={dashboard.gallery.id} />}
        <ZipPanel
          eventId={id}
          lastZip={
            dashboard.lastZip
              ? {
                  id: dashboard.lastZip.id,
                  status: dashboard.lastZip.status,
                  itemCount: dashboard.lastZip.itemCount,
                  sizeBytes: dashboard.lastZip.sizeBytes,
                  createdAt: dashboard.lastZip.createdAt.toISOString(),
                }
              : null
          }
        />
        <HostGuestbook
          eventId={id}
          eventName={event.name}
          initialMessages={wall.messages.map((m) => ({
            id: m.id,
            name: m.name,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
            hidden: m.hidden,
          }))}
        />
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-medium">{t('queueTitle')}</h3>
              <p className="text-muted text-sm">{t('queueBody')}</p>
            </div>
            <Link
              href={`/m/${dashboard.gallery.code}/slideshow`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              {t('openSlideshow')}
            </Link>
          </div>
          <ModerationQueue
            eventId={id}
            initialPending={pending.map((item) => ({
              id: item.id,
              album: item.album,
              kind: item.kind,
              thumbUrl: item.thumbUrl,
              largeUrl: item.largeUrl,
              createdAt: item.createdAt.toISOString(),
              uploaderLabel: item.uploaderLabel,
              featured: item.featured,
            }))}
            initialCursor={pendingPage.nextCursor}
            initialPublished={published.map((item) => ({
              id: item.id,
              album: item.album,
              kind: item.kind,
              thumbUrl: item.thumbUrl,
              largeUrl: item.largeUrl,
              createdAt: item.createdAt.toISOString(),
              uploaderLabel: item.uploaderLabel,
              featured: item.featured,
            }))}
            initialPublishedCursor={publishedPage.nextCursor}
            initialReports={reports}
          />
        </Card>
      </div>
    </EventFrame>
  );
}
