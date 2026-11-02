import { authorize, budgetSummary, closePack, listPaymentSchedule } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Card, MoneyText } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { privateStorage } from '@/lib/storage.js';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { CloseManager } from './close-manager.js';

/** `/events/[id]/close` (P14-T02, UF-25): confirm deliveries, reconcile,
 * review every vendor, then finish. Host-only tab (needs `event.close`). */
export default async function ClosePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(id, '/close', 'event.view');
  const t = await getTranslations('close');
  const te = await getTranslations('events');
  if (!allowed) {
    return (
      <EventFrame
        eventId={id}
        userId={ctx.actor.userId}
        access={access}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
        active="close"
        title={t('title')}
      >
        <Forbidden eventId={id} />
      </EventFrame>
    );
  }
  const canClose = (() => {
    try {
      authorize(ctx.actor, 'event.close', { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  })();
  if (!canClose) {
    return (
      <EventFrame
        eventId={id}
        userId={ctx.actor.userId}
        access={access}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
        active="close"
        title={t('title')}
      >
        <Forbidden eventId={id} />
      </EventFrame>
    );
  }
  const [pack, money, gallery] = await Promise.all([
    closePack(ctx.actor, id).catch(() => null),
    Promise.all([
      budgetSummary(ctx.actor, { eventId: id }, access),
      listPaymentSchedule(ctx.actor, { eventId: id }, access),
    ]).catch(() => null),
    prisma.gallery.findUnique({ where: { eventId: id }, select: { id: true } }),
  ]);
  const photos = gallery
    ? await prisma.mediaItem.findMany({
        where: { galleryId: gallery.id, state: 'PUBLISHED', kind: 'PHOTO' },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: { id: true, thumbKey: true },
      })
    : [];
  const storage = privateStorage();
  const thumbs = await Promise.all(
    photos.map(async (row) => ({
      id: row.id,
      thumbUrl: row.thumbKey ? await storage.getSignedUrl(row.thumbKey, 3600) : null,
    })),
  );
  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
      active="close"
      title={t('title')}
    >
      <div className="flex flex-col gap-4 py-2">
        <p className="text-muted text-sm">{t('subtitle')}</p>
        {money && (
          <Card className="flex flex-col gap-2 p-4 text-sm">
            <h2 className="font-display text-lg font-bold">{t('reconciliationHeading')}</h2>
            <dl className="grid grid-cols-3 gap-2">
              <div>
                <dt className="text-muted">{te('overview.moneyBudget')}</dt>
                <dd className="font-display font-bold">
                  <MoneyText value={money[0].totals.plannedMinor.toString()} currency={money[0].currency} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">{te('money.paid')}</dt>
                <dd className="font-display font-bold">
                  <MoneyText value={money[0].totals.paidMinor.toString()} currency={money[0].currency} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">{te('money.outstanding')}</dt>
                <dd className="font-display font-bold">
                  <MoneyText value={money[0].totals.outstandingMinor.toString()} currency={money[0].currency} />
                </dd>
              </div>
            </dl>
          </Card>
        )}
        {!pack ? (
          <Card className="p-4">
            <p className="text-muted text-sm">{t('noBookings')}</p>
          </Card>
        ) : (
          <CloseManager eventId={id} eventStatus={pack.event.status} bookings={pack.bookings} photos={thumbs} />
        )}
      </div>
    </EventFrame>
  );
}
