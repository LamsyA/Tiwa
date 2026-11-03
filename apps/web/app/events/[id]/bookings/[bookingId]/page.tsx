import { bookingMoney, describeChange, getBooking, listBookingPayments, stageForBooking } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, Card, MoneyText, StatusPill, buttonClasses } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { OrderTimeline } from '@/components/orders/order-timeline.js';
import { BookingTabbar } from './booking-tabbar.js';
import { ChangeRequestDialog, PendingDecision } from './change-dialog.js';
import { PaymentsPanel } from './payments-panel.js';
import { ChangeSummary as VersionSummary } from '@/components/bookings/change-summary.js';

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
  // Each version against the one before it, so a change reads as "what moved" (UF-19).
  const summaries = new Map(
    pricesHidden
      ? []
      : booking.versions.map((row, i) => {
          const prev = booking.versions[i - 1];
          return [
            row.id,
            prev
              ? describeChange(
                  { ...(prev.scope as unknown as ScopeView), totalMinor: String(prev.totalMinor) },
                  { ...(row.scope as unknown as ScopeView), totalMinor: String(row.totalMinor) },
                )
              : null,
          ] as const;
        }),
  );
  const pendingSummary =
    pending && !pricesHidden
      ? describeChange(
          { ...(current.scope as unknown as ScopeView), totalMinor: String(current.totalMinor) },
          { ...(pending.scope as unknown as ScopeView), totalMinor: String(pending.totalMinor) },
        )
      : null;
  const pendingBy = pending ? (pending as { proposedById?: string }).proposedById : undefined;
  const askedByVendor = pendingBy
    ? (await prisma.membership.count({ where: { orgId: booking.vendorOrgId, userId: pendingBy } })) > 0
    : false;
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
            mine={pendingBy === ctx.actor.userId}
            otherName={vendor?.name ?? ''}
            askedBy={askedByVendor ? (vendor?.name ?? '') : t('change.yourTeam')}
            reason={pending.reason ?? null}
            summary={pendingSummary}
            currency={booking.currency}
          />
        )}
        <BookingTabbar eventId={eventId} bookingId={booking.id} active={active} items={tabs} label={t('title')} />
        {active === 'details' && (
          <Card>
            <div className="flex flex-col gap-2 p-4 text-sm">
              <h3 className="font-display text-base font-bold tracking-tight">{t('scopeHeading')}</h3>
              {scope == null ? (
                <p className="text-muted">{t('hiddenByPlanner')}</p>
              ) : (
                <>
                  <ul className="divide-border/60 border-border/70 flex flex-col divide-y rounded-2xl border">
                    {scope.items.map((item, i) => (
                      <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1">{item.name}</span>
                        <span className="text-muted text-xs">
                          {item.qty} × <MoneyText value={item.unitMinor} currency={booking.currency} />
                        </span>
                      </li>
                    ))}
                  </ul>
                  {scope.notes && <p className="text-muted">{scope.notes}</p>}
                </>
              )}
              <h3 className="font-display text-base font-bold tracking-tight">{t('termsHeading')}</h3>
              <p className="text-muted">{current.terms}</p>
              <h3 className="font-display text-base font-bold tracking-tight">{t('scheduleHeading')}</h3>
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
                {!pricesHidden && scope && !pending && !closed && (
                  <ChangeRequestDialog
                    bookingId={booking.id}
                    currency={booking.currency}
                    current={{ items: scope.items, notes: scope.notes, serviceDate: scope.serviceDate }}
                    slot={scope.slot}
                    side="host"
                  />
                )}
              </div>
            </div>
          </Card>
        )}
        {active === 'versions' && (
          <ul className="flex flex-col gap-3">
            {[...booking.versions].reverse().map((row) => {
              const summary = summaries.get(row.id) ?? null;
              return (
                <li key={row.id} className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-display font-semibold">v{row.version}</span>
                    <StatusPill
                      tone={row.status === 'ACCEPTED' ? 'success' : row.status === 'PROPOSED' ? 'brand' : 'neutral'}
                    >
                      {t.has(`versionStatus.${row.status}`) ? t(`versionStatus.${row.status}`) : row.status}
                    </StatusPill>
                    {row.version === booking.currentVersion && <span className="text-muted">{t('currentBadge')}</span>}
                    <span className="text-muted ml-auto text-xs">
                      {new Date(row.createdAt).toLocaleDateString('en', { dateStyle: 'medium' })}
                    </span>
                  </div>
                  {summary && (
                    <VersionSummary summary={summary} currency={booking.currency} reason={row.reason ?? null} />
                  )}
                </li>
              );
            })}
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
            <div className="flex flex-col items-start gap-3 p-4 text-sm">
              <p className="text-muted">{t('messagesBody', { name: vendor?.name ?? '' })}</p>
              <Link
                href={data.threadId ? `/inbox/${data.threadId}` : '/inbox'}
                className={buttonClasses({ variant: 'secondary' })}
              >
                {t('openChat')}
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
                  {file.name} · {formatSize(Number(file.sizeBytes))}
                </p>
              ))}
            </div>
          </Card>
        )}
      </div>
    </EventFrame>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
