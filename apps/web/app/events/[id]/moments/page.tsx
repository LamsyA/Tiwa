import { env } from '@tiwa/config';
import { getMomentsDashboard, listOpenMediaReports, listPendingMedia, authorize } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Card, StatCard } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { withSignedUrls } from '@/lib/gallery-urls.js';
import { privateStorage } from '@/lib/storage.js';
import { MomentsQrCard } from './moments-qr.js';
import { MomentsSettingsForm } from './moments-settings.js';
import { ModerationQueue } from './moderation-queue.js';

/** P5-T08 / Frontend.md §6.3: host Moments page — settings, QR, queue, stats. */
export default async function HostMomentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed, invitesOn, momentsOn } = await loadEventPage(id, '/moments');
  const t = await getTranslations('events.momentsPage');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    select: { name: true, momentsEnabled: true },
  });

  const canModerate = (() => {
    try {
      authorize(ctx.actor, 'moments.moderate', { eventId: id, access });
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

  const [dashboard, pendingPage, reported] = await Promise.all([
    getMomentsDashboard(ctx.actor, id, access),
    listPendingMedia(ctx.actor, id, { limit: 60 }, access),
    listOpenMediaReports(ctx.actor, id, access),
  ]);
  const base = env.APP_URL.replace(/\/$/, '');
  const galleryUrl = `${base}/m/${dashboard.gallery.code}`;
  const storage = privateStorage();
  const [pending, reports] = await Promise.all([
    withSignedUrls(pendingPage.items),
    Promise.all(
      reported.reports.map(async (report) => ({
        id: report.id,
        reason: report.reason,
        createdAt: report.createdAt.toISOString(),
        reporterLabel: report.reporterLabel,
        item: report.item
          ? {
              id: report.item.id,
              kind: report.item.kind,
              state: report.item.state,
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
      active="moments"
      title={event.name}
    >
      <div className="flex flex-col gap-4 py-2">
        <h2 className="font-display text-xl font-bold">{t('title')}</h2>
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
          galleryUrl={galleryUrl}
          canEdit
        />
        <MomentsQrCard eventName={event.name} galleryUrl={galleryUrl} />
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <h3 className="font-medium">{t('queueTitle')}</h3>
            <p className="text-muted text-sm">{t('queueBody')}</p>
          </div>
          <ModerationQueue
            eventId={id}
            initialPending={pending.map((item) => ({
              id: item.id,
              kind: item.kind,
              thumbUrl: item.thumbUrl,
              largeUrl: item.largeUrl,
              createdAt: item.createdAt.toISOString(),
              uploaderLabel: item.uploaderLabel,
              featured: item.featured,
            }))}
            initialCursor={pendingPage.nextCursor}
            initialReports={reports}
          />
        </Card>
      </div>
    </EventFrame>
  );
}
