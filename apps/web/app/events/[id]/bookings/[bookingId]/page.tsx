import { bookingMoney, diffScopes, getBooking, listBookingPayments } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, Card, MoneyText, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
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
  const { ctx, access, allowed, invitesOn, momentsOn } = await loadEventPage(eventId, '/vendors');
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
      >
        <Banner tone="warning">{t('errors.FORBIDDEN')}</Banner>
      </EventFrame>
    );
  }
  const data = await getBooking(ctx.actor, { bookingId }).catch(() => null);
  if (!data || data.booking.eventId !== eventId) notFound();
  const { booking, vendor, event } = data;

  const current =
    booking.versions.find((row) => row.status === 'ACCEPTED') ?? booking.versions[booking.versions.length - 1]!;
  const pending = booking.versions.find((row) => row.status === 'PROPOSED');
  const scope = current.scope as unknown as ScopeView & { totalMinor?: string };
  const files = await prisma.document.findMany({
    where: { bookingId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, mime: true, sizeBytes: true },
  });
  const payments = await listBookingPayments(booking.id);
  const money = bookingMoney(booking.milestones);
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
    >
      <div className="flex flex-col gap-4 py-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill tone={booking.status === 'CONFIRMED' ? 'success' : 'neutral'}>{booking.status}</StatusPill>
          <span className="font-medium">
            <MoneyText value={booking.totalMinor} currency={booking.currency} />
          </span>
          <span className="text-muted">{booking.paymentMode}</span>
          {booking.holdExpiresAt && booking.status === 'DEPOSIT_DUE' && (
            <span className="text-muted">
              {t('holdLabel', { date: new Date(booking.holdExpiresAt).toLocaleString() })}
            </span>
          )}
        </div>
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
              <ul className="text-muted flex flex-col gap-0.5">
                {scope.items.map((item, i) => (
                  <li key={i}>
                    {item.name} × {item.qty}
                  </li>
                ))}
              </ul>
              {scope.notes && <p className="text-muted">{scope.notes}</p>}
              <h3 className="font-medium">{t('termsHeading')}</h3>
              <p className="text-muted">{current.terms}</p>
              <h3 className="font-medium">{t('scheduleHeading')}</h3>
              <ul className="text-muted flex flex-col gap-0.5">
                {booking.milestones.map((row) => (
                  <li key={row.id}>
                    {row.label} · {row.amountMinor} {row.currency} · {row.state}
                  </li>
                ))}
              </ul>
              <p className="text-muted">
                {event.name} · {event.timezone}
              </p>
              <div className="flex gap-2">
                <ChangeRequestDialog
                  bookingId={booking.id}
                  currency={booking.currency}
                  current={{ items: scope.items, notes: scope.notes, serviceDate: scope.serviceDate }}
                  slot={scope.slot}
                />
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
                {pending && row.id === pending.id && current && (
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
            canRecord={data.viewer === 'host' && booking.paymentMode !== 'HELD' && !closed}
            money={{
              securedMinor: money.securedMinor.toString(),
              awaitingMinor: money.awaitingMinor.toString(),
              outstandingMinor: money.outstandingMinor.toString(),
            }}
            milestones={booking.milestones.map((row) => ({
              id: row.id,
              label: row.label,
              amountMinor: String(row.amountMinor),
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
