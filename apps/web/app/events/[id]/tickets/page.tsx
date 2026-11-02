import { authorize, isEnabled, listTicketOrders, ticketSales } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, Card, DateText, MoneyText, buttonClasses } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { TicketsManager } from './tickets-manager.js';

/** P11-T02: organiser tickets admin — types, promos, questions, publish, orders. */
export default async function TicketsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(id, '/tickets', 'event.view');
  const t = await getTranslations('tickets');
  if (!allowed) {
    return (
      <EventFrame
        eventId={id}
        userId={ctx.actor.userId}
        access={access}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
        active="tickets"
        title={t('title')}
      >
        <Forbidden eventId={id} />
      </EventFrame>
    );
  }
  const canManage = await (async () => {
    try {
      authorize(ctx.actor, 'tickets.manage', { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  })();
  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    select: {
      name: true,
      slug: true,
      visibility: true,
      ticketsEnabled: true,
      ticketsPublished: true,
      registrationQuestions: true,
      currency: true,
      countryCode: true,
      timezone: true,
    },
  });
  const payoutsOn = await isEnabled('payments.payouts', event.countryCode).catch(() => false);
  const [sales, types, promos, orders, programme] = await Promise.all([
    ticketSales(ctx.actor, id).catch(() => null),
    prisma.ticketType.findMany({ where: { eventId: id }, orderBy: { sortOrder: 'asc' } }),
    prisma.promoCode.findMany({ where: { eventId: id }, orderBy: { code: 'asc' } }),
    canManage ? listTicketOrders(ctx.actor, id).catch(() => []) : Promise.resolve([]),
    prisma.programmeItem.findMany({
      where: { eventId: id, isPublic: true },
      orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, title: true, startsAt: true, room: true },
      take: 100,
    }),
  ]);
  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
      active="tickets"
      title={event.name}
    >
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-bold">{t('title')}</h2>
          <div className="ml-auto flex gap-2">
            <Link href={`/e/${event.slug}`} className={buttonClasses({ variant: 'secondary' })} target="_blank">
              {t('viewPublic')}
            </Link>
            <Link href={`/events/${id}/check-in`} className={buttonClasses({ variant: 'secondary' })}>
              {t('openCheckin')}
            </Link>
          </div>
        </div>
        {event.visibility !== 'PUBLIC' && <Banner tone="warning">{t('needsPublic')}</Banner>}
        {/* P11-T09: organiser payouts stay behind `payments.payouts` (D-M03/Q-005). */}
        <Card className="flex flex-col gap-2 p-4">
          <h3 className="font-medium">{t('payouts')}</h3>
          {payoutsOn ? (
            <p className="text-muted text-sm">{t('payoutsPending', { amount: sales?.revenueMinor ?? '0' })}</p>
          ) : (
            <p className="text-muted text-sm">{t('payoutsNote')}</p>
          )}
        </Card>
        {sales && (
          <Card className="flex flex-wrap gap-6 p-4">
            <div>
              <p className="text-muted text-sm">{t('sold')}</p>
              <p className="font-display text-2xl font-bold">{sales.rows.reduce((n, r) => n + r.sold, 0)}</p>
            </div>
            <div>
              <p className="text-muted text-sm">{t('reserved')}</p>
              <p className="font-display text-2xl font-bold">{sales.rows.reduce((n, r) => n + r.reserved, 0)}</p>
            </div>
            <div>
              <p className="text-muted text-sm">{t('revenue')}</p>
              <p className="font-display text-2xl font-bold">
                <MoneyText value={sales.revenueMinor} currency={event.currency} />
              </p>
            </div>
            <div>
              <p className="text-muted text-sm">{t('paidOrders')}</p>
              <p className="font-display text-2xl font-bold">{sales.paidOrders}</p>
            </div>
          </Card>
        )}
        {programme.length > 0 && (
          <Card className="flex flex-col gap-2 p-4">
            <h3 className="font-medium">{t('agenda')}</h3>
            {programme.map((item) => (
              <div key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">
                  {item.title}
                  {item.room ? <span className="text-muted"> · {item.room}</span> : null}
                </span>
                {item.startsAt && <DateText value={item.startsAt} format="time" timeZone={event.timezone} />}
              </div>
            ))}
          </Card>
        )}
        <TicketsManager
          eventId={id}
          currency={event.currency}
          canManage={canManage}
          ticketsEnabled={event.ticketsEnabled}
          ticketsPublished={event.ticketsPublished}
          registrationQuestions={
            (event.registrationQuestions ?? []) as { key: string; label: string; required: boolean }[]
          }
          types={types.map((row) => ({
            ...row,
            priceMinor: row.priceMinor.toString(),
            salesStart: row.salesStart?.toISOString() ?? null,
            salesEnd: row.salesEnd?.toISOString() ?? null,
          }))}
          promos={promos.map((row) => ({
            ...row,
            amountOffMinor: row.amountOffMinor?.toString() ?? null,
            expiresAt: row.expiresAt?.toISOString() ?? null,
          }))}
          orders={orders.map((row) => ({
            ...row,
            totalMinor: row.totalMinor.toString(),
            createdAt: row.createdAt.toISOString(),
            reservedUntil: row.reservedUntil.toISOString(),
          }))}
        />
      </div>
    </EventFrame>
  );
}
