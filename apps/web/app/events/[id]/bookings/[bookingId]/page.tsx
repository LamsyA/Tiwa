import { bookingMoney, diffScopes, getBooking, listBookingPayments, stageForBooking } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, Card, MoneyText, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { OrderTimeline } from '@/components/orders/order-timeline.js';
import { BookingTabbar } from './booking-tabbar.js';
import { ChangeRequestDialog, PendingDecision } from './change-dialog.js';
import { PaymentsPanel } from './payments-panel.js';

interface ScopeView {
  items: { name: string; qty: number; unitMinor: string }[];
  notes: string | null;
  serviceDate: string | null;
  slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY' | null;
}

/** Booking page (P7-T07): details, versions, payments (offline recording, P8-T08), files. */
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; bookingId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: eventId, bookingId } = await params;
  const { tab } = await searchParams;
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(eventId, '/vendors');
  const t = await getTranslations('bookings');
  if (!allowed) {
    return (
      <EventFrame
        eventId={eventId}
        userId={ctx.actor.userId}
        access={access}
        active="vendors"
        title={t('title')}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
      >
        <Banner tone="warning">{t('errors.FORBIDDEN')}</Banner>
      </EventFrame>
    );
  }
  const data = await getBooking(ctx.actor, { bookingId }).catch(() => null);
  if (!data || data.booking.eventId !== eventId) notFound();
  const { booking, vendor, event } = data;
  const pricesHidden = 'pricesHidden' in booking;

  const current =
    booking.versions.find((row) => row.status === 'ACCEPTED') ?? booking.versions[booking.versions.length - 1]!;
  const pending = booking.versions.find((row) => row.status === 'PROPOSED');
  const scope = (pricesHidden ? null : (current.scope as unknown as ScopeView & { totalMinor?: string })) as
    (ScopeView & { totalMinor?: string }) | null;
  const files = await prisma.document.findMany({
    where: { bookingId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, mime: true, sizeBytes: true },
  });
  const payments = await listBookingPayments(booking.id);
  const money = pricesHidden
    ? { totalMinor: 0n, securedMinor: 0n, awaitingMinor: 0n, outstandingMinor: 0n }
    : bookingMoney(booking.milestones);
  const closed = booking.status === 'CANCELLED' || booking.status === 'COMPLETED';

  const tabs = [
    { value: 'details', label: t('detailsTab') },
    { value: 'versions', label: t('versionsTab') },
    { value: 'payments', label: t('paymentsTab') },
    { value: 'messages', label: t('messagesTab') },
    { value: 'files', label: t('filesTab') },
  ];
  const active = tabs.some((item) => item.value === tab) ? tab! : 'details';

  return (
    <EventFrame
      eventId={eventId}
      userId={ctx.actor.userId}
      access={access}
      active="vendors"
      title={`${t('title')} · ${vendor?.name ?? ''}`}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
    >
      <div className="flex flex-col gap-4 py-4">
        <OrderTimeline
          stage={stageForBooking(booking.status)}
          side="client"
          title={vendor?.name ?? t('title')}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-2">
              <span>{t(`mode.${booking.paymentMode}`)}</span>
              {booking.holdExpiresAt && booking.status === 'DEPOSIT_DUE' && (
                <span>· {t('holdLabel', { date: new Date(booking.holdExpiresAt).toLocaleString() })}</span>
              )}
            </span>
          }
          aside={
            <>
              <span className="font-display text-2xl font-bold">
                {booking.totalMinor == null ? (
                  <span className="text-muted text-sm">{t('hiddenByPlanner')}</span>
                ) : (
                  <MoneyText value={booking.totalMinor} currency={booking.currency} />
                )}
              </span>
              {!pricesHidden && money.outstandingMinor > 0n && (
                <span className="text-muted text-xs">
                  {t('outstandingShort')}{' '}
                  <MoneyText value={money.outstandingMinor.toString()} currency={booking.currency} />
                </span>
              )}
              <StatusPill tone={booking.status === 'CONFIRMED' ? 'success' : 'neutral'}>
                {t(`status.${booking.status}`)}
              </StatusPill>
            </>
          }
        />
        {pending && (
          <PendingDecision
            versionId={pending.id}
            mine={(pending as { proposedById?: string }).proposedById === ctx.actor.userId}
            vendorName={vendor?.name ?? ''}
            version={pending.version}
          />
        )}
        <BookingTabbar eventId={eventId} bookingId={booking.id} active={active} items={tabs} label={t('title')} />
        {active === 'details' && (
          <Card>
            <div className="flex flex-col gap-2 p-4 text-sm">
              <h3 className="font-medium">{t('scopeHeading')}</h3>
              {scope == null ? (
                <p className="text-muted">{t('hiddenByPlanner')}</p>
              ) : (
                <>
                  <ul className="text-muted flex flex-col gap-0.5">
                    {scope.items.map((item, i) => (
                      <li key={i}>
                        {item.name} × {item.qty}
                      </li>
                    ))}
                  </ul>
                  {scope.notes && <p className="text-muted">{scope.notes}</p>}
                </>
              )}
              <h3 className="font-medium">{t('termsHeading')}</h3>
              <p className="text-muted">{current.terms}</p>
              <h3 className="font-medium">{t('scheduleHeading')}</h3>
              <ul className="divide-border/60 border-border/70 flex flex-col divide-y rounded-2xl border">
                {booking.milestones.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
                    <span className="font-semibold">
                      {row.amountMinor == null ? (
                        <span className="text-muted">{t('hiddenByPlanner')}</span>
                      ) : (
                        <MoneyText value={row.amountMinor} currency={row.currency} />
                      )}
                    </span>
                    <StatusPill
                      tone={
                        ['RELEASED', 'PAID_DIRECT', 'CONFIRMED_OFFLINE', 'HELD'].includes(row.state)
                          ? 'success'
                          : 'neutral'
                      }
                    >
                      {t.has(`milestone.${row.state}`) ? t(`milestone.${row.state}`) : row.state}
                    </StatusPill>
                  </li>
                ))}
              </ul>
              <p className="text-muted">
                {event.name} · {event.timezone}
              </p>
              <div className="flex gap-2">
                {!pricesHidden && scope && (
                  <ChangeRequestDialog
                    bookingId={booking.id}
                    currency={booking.currency}
                    current={{ items: scope.items, notes: scope.notes, serviceDate: scope.serviceDate }}
                    slot={scope.slot}
                  />
                )}
              </div>
            </div>
          </Card>
        )}
        {active === 'versions' && (
          <ul className="flex flex-col gap-2">
            {booking.versions.map((row) => (
              <li key={row.id} className="border-border rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{row.version}</span>
                  <StatusPill
                    tone={row.status === 'ACCEPTED' ? 'success' : row.status === 'PROPOSED' ? 'brand' : 'neutral'}
                  >
                    {row.status}
                  </StatusPill>
                  {row.version === booking.currentVersion && <span className="text-muted">{t('currentBadge')}</span>}
                </div>
                {pending && row.id === pending.id && current && !pricesHidden && scope && (
                  <p className="text-muted mt-1">
                    {t('diffAdded', {
                      amount: (() => {
                        const next = row.scope as unknown as ScopeView & { totalMinor: string };
                        const prev = { ...scope, totalMinor: current.totalMinor } as unknown as ScopeView & {
                          totalMinor: string;
                        };
                        return diffScopes(prev, next).totalDiffMinor;
                      })(),
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {active === 'payments' && (
          <PaymentsPanel
            currency={booking.currency}
            canRecord={data.viewer === 'host' && booking.paymentMode !== 'HELD' && !closed && !pricesHidden}
            money={{
              securedMinor: pricesHidden ? null : money.securedMinor.toString(),
              awaitingMinor: pricesHidden ? null : money.awaitingMinor.toString(),
              outstandingMinor: pricesHidden ? null : money.outstandingMinor.toString(),
            }}
            milestones={booking.milestones.map((row) => ({
              id: row.id,
              label: row.label,
              amountMinor: row.amountMinor == null ? null : String(row.amountMinor),
              currency: row.currency,
              state: row.state,
              dueAt: row.dueAt ? new Date(row.dueAt).toISOString() : null,
            }))}
            payments={payments.map((row) => ({
              id: row.id,
              milestoneId: row.milestoneId,
              status: row.status,
              paidAt: row.paidAt?.toISOString() ?? null,
              offlineMethod: row.offlineMethod,
              hasReceipt: row.hasReceipt,
            }))}
          />
        )}
        {active === 'messages' && (
          <Card>
            <div className="p-4 text-sm">
              <p className="text-muted">{t('messagesSoon')}</p>
              <Link href="/inbox" className="underline">
                {t('messagesTab')}
              </Link>
            </div>
          </Card>
        )}
        {active === 'files' && (
          <Card>
            <div className="flex flex-col gap-1 p-4 text-sm">
              {files.length === 0 && <p className="text-muted">{t('noFiles')}</p>}
              {files.map((file) => (
                <p key={file.id}>
                  {file.name} · {file.sizeBytes}
                </p>
              ))}
            </div>
          </Card>
        )}
      </div>
    </EventFrame>
  );
}
