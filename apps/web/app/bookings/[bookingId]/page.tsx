import {
  bookingMoney,
  describeChange,
  getBooking,
  getVendorBrief,
  listPendingOfflinePayments,
  stageForBooking,
} from '@tiwa/core';
import { VENDOR_CATEGORIES } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { MoneyText, StatusPill, buttonClasses } from '@tiwa/ui';
import { CalendarDays, MapPin, MessageCircle, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type * as React from 'react';
import { AppFrame } from '@/components/app-frame.js';
import { ChangeSummary } from '@/components/bookings/change-summary.js';
import { OrderTimeline } from '@/components/orders/order-timeline.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ChangeRequestDialog, PendingDecision } from '../../events/[id]/bookings/[bookingId]/change-dialog.js';
import { PaymentCards } from '../../quotes/payment-cards.js';

interface ScopeView {
  items: { name: string; qty: number; unitMinor: string }[];
  notes: string | null;
  serviceDate: string | null;
  slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY' | null;
}

const PAID = ['RELEASED', 'PAID_DIRECT', 'CONFIRMED_OFFLINE', 'HELD'];

/**
 * The vendor's own booking page: what was agreed, what the client asked to
 * change (and exactly what moved), payments to confirm, and "Request a change
 * or extra payment" when the job grows. Hosts are sent to their event's page.
 */
export default async function VendorBookingPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const ctx = await requirePageUser(`/bookings/${bookingId}`);
  const data = await getBooking(ctx.actor, { bookingId }).catch(() => null);
  if (!data) notFound();
  if (data.viewer !== 'vendor') redirect(`/events/${data.booking.eventId}/bookings/${bookingId}`);
  const t = await getTranslations('bookings');
  const tv = await getTranslations('vendorBooking');
  const { booking, vendor, threadId } = data;

  const [brief, payments, team] = await Promise.all([
    getVendorBrief(ctx.actor, { bookingId }),
    listPendingOfflinePayments(ctx.actor, { vendorOrgId: booking.vendorOrgId }).catch(() => []),
    prisma.membership.findMany({ where: { orgId: booking.vendorOrgId }, select: { userId: true } }),
  ]);
  const vendorUsers = new Set(team.map((row) => row.userId));
  const current =
    booking.versions.find((row) => row.status === 'ACCEPTED') ?? booking.versions[booking.versions.length - 1]!;
  const pending = booking.versions.find((row) => row.status === 'PROPOSED');
  const scope = current.scope as unknown as ScopeView;
  const asScope = (row: typeof current) => ({
    ...(row.scope as unknown as ScopeView),
    totalMinor: String(row.totalMinor),
  });
  const money = bookingMoney(booking.milestones as never);
  const closed = booking.status === 'CANCELLED' || booking.status === 'COMPLETED';
  const toConfirm = payments
    .filter((row) => row.milestone?.booking.id === booking.id)
    .map((row) => ({
      ...row,
      paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null,
    }));
  const category = VENDOR_CATEGORIES[booking.category as keyof typeof VENDOR_CATEGORIES] ?? booking.category;
  const day = brief.event.days[0];
  const when = booking.serviceDate ?? brief.event.startsAt;
  const pendingMine = pending ? vendorUsers.has(pending.proposedById) : false;

  return (
    <AppFrame userId={ctx.actor.userId} active="bookings" title={brief.event.name}>
      <div className="flex flex-col gap-4 py-4">
        <Link href="/bookings" className="text-brand-strong text-sm font-semibold hover:underline">
          ← {tv('back')}
        </Link>
        <OrderTimeline
          stage={stageForBooking(booking.status)}
          side="vendor"
          title={brief.event.name}
          subtitle={<span>{category}</span>}
          aside={
            <>
              <span className="font-display text-2xl font-bold">
                <MoneyText value={String(booking.totalMinor)} currency={booking.currency} />
              </span>
              {money.outstandingMinor > 0n && (
                <span className="text-muted text-xs">
                  {tv('stillOwed')} <MoneyText value={money.outstandingMinor.toString()} currency={booking.currency} />
                </span>
              )}
              <StatusPill tone={booking.status === 'CONFIRMED' ? 'success' : 'neutral'}>
                {t.has(`status.${booking.status}`) ? t(`status.${booking.status}`) : booking.status}
              </StatusPill>
            </>
          }
        />

        {pending && (
          <PendingDecision
            versionId={pending.id}
            mine={pendingMine}
            otherName={t('change.client')}
            askedBy={pendingMine ? (vendor?.name ?? '') : t('change.client')}
            reason={pending.reason ?? null}
            summary={describeChange(asScope(current), asScope(pending))}
            currency={booking.currency}
          />
        )}

        {toConfirm.length > 0 && <PaymentCards payments={toConfirm} />}

        <section className="grid gap-3 sm:grid-cols-3">
          <Fact icon={<CalendarDays className="size-4" aria-hidden />} label={tv('when')}>
            {when
              ? new Intl.DateTimeFormat('en', {
                  dateStyle: 'medium',
                  timeStyle: booking.serviceDate ? undefined : 'short',
                  timeZone: brief.event.timezone,
                }).format(new Date(when))
              : tv('tbc')}
          </Fact>
          <Fact icon={<MapPin className="size-4" aria-hidden />} label={tv('where')}>
            {day?.venueName ?? day?.address ?? tv('tbc')}
          </Fact>
          <Fact icon={<Users className="size-4" aria-hidden />} label={tv('guests')}>
            {brief.event.expectedGuests ?? tv('tbc')}
          </Fact>
        </section>

        <section className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{t('scopeHeading')}</h2>
            {!pending && !closed && (
              <ChangeRequestDialog
                bookingId={booking.id}
                currency={booking.currency}
                current={{ items: scope.items, notes: scope.notes, serviceDate: scope.serviceDate }}
                slot={scope.slot}
                side="vendor"
              />
            )}
          </div>
          <ul className="divide-border/60 border-border/70 flex flex-col divide-y rounded-2xl border text-sm">
            {scope.items.map((item, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">{item.name}</span>
                <span className="text-muted text-xs">
                  {item.qty} × <MoneyText value={item.unitMinor} currency={booking.currency} />
                </span>
                <span className="font-medium">
                  <MoneyText
                    value={(BigInt(item.qty) * BigInt(item.unitMinor)).toString()}
                    currency={booking.currency}
                  />
                </span>
              </li>
            ))}
          </ul>
          {scope.notes && <p className="text-muted text-sm whitespace-pre-line">{scope.notes}</p>}
          {!pending && !closed && <p className="text-muted text-xs">{tv('changeHint')}</p>}
        </section>

        <section className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-4 sm:p-5">
          <h2 className="font-display text-lg font-semibold">{t('scheduleHeading')}</h2>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {(
              [
                ['secured', money.securedMinor],
                ['awaiting', money.awaitingMinor],
                ['outstanding', money.outstandingMinor],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="bg-surface-2 rounded-xl px-3 py-2">
                <dt className="text-muted text-xs">{tv(`money.${key}`)}</dt>
                <dd className="font-semibold">
                  <MoneyText value={value.toString()} currency={booking.currency} />
                </dd>
              </div>
            ))}
          </dl>
          <ul className="divide-border/60 border-border/70 flex flex-col divide-y rounded-2xl border text-sm">
            {booking.milestones.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
                <span className="font-semibold">
                  <MoneyText value={String(row.amountMinor)} currency={row.currency} />
                </span>
                <StatusPill tone={PAID.includes(row.state) ? 'success' : 'neutral'}>
                  {t.has(`milestone.${row.state}`) ? t(`milestone.${row.state}`) : row.state}
                </StatusPill>
              </li>
            ))}
          </ul>
        </section>

        {booking.versions.length > 1 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold">{t('versionsHeading')}</h2>
            <ul className="flex flex-col gap-3">
              {[...booking.versions].reverse().map((row) => {
                const at = booking.versions.indexOf(row);
                const prev = booking.versions[at - 1];
                if (!prev || row.status === 'PROPOSED') return null;
                return (
                  <li key={row.id} className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-display font-semibold">v{row.version}</span>
                      <StatusPill tone={row.status === 'ACCEPTED' ? 'success' : 'neutral'}>
                        {t.has(`versionStatus.${row.status}`) ? t(`versionStatus.${row.status}`) : row.status}
                      </StatusPill>
                      <span className="text-muted text-xs">
                        {vendorUsers.has(row.proposedById) ? tv('askedByYou') : tv('askedByClient')}
                      </span>
                    </div>
                    <ChangeSummary
                      summary={describeChange(asScope(prev), asScope(row))}
                      currency={booking.currency}
                      reason={row.reason ?? null}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {threadId && (
          <Link
            href={`/inbox/${threadId}`}
            className={buttonClasses({ variant: 'secondary', className: 'self-start' })}
          >
            <MessageCircle className="size-4" aria-hidden />
            {tv('message')}
          </Link>
        )}
      </div>
    </AppFrame>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="border-border/70 bg-surface flex items-start gap-3 rounded-2xl border p-3">
      <span className="bg-brand/10 text-brand-strong grid size-8 shrink-0 place-items-center rounded-full">{icon}</span>
      <div className="min-w-0">
        <p className="text-muted text-xs">{label}</p>
        <p className="truncate text-sm font-medium">{children}</p>
      </div>
    </div>
  );
}
