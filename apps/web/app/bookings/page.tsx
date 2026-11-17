import { listMyOrgs, listVendorBookingMoney, pendingReplies, vendorDayTasks, vendorEarnings } from '@tiwa/core';
import { EmptyState, MoneyText, StatusPill } from '@tiwa/ui';
import { Briefcase, CalendarDays } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { EarningsPanel } from './earnings-panel.js';
import { VendorDayCard } from './vendor-day.js';
import { VendorReplies } from './vendor-replies.js';

/** On the day: from 12 h before the start to 36 h after (server render time). */
function isEventDay(starts: Date): boolean {
  const diff = starts.getTime() - Date.now();
  return diff < 12 * 3_600_000 && diff > -36 * 3_600_000;
}

/** Vendor bookings with payment status (VND-04, P10-T08). */
export default async function BookingsPage() {
  const ctx = await requirePageUser('/bookings');
  const t = await getTranslations('vendor');
  const tb = await getTranslations('bookings');
  const tv = await getTranslations('vendorBooking');
  const orgs = await listMyOrgs(ctx.actor.userId);
  const vendorOrg = orgs.find((r) => r.org.kind === 'VENDOR')?.org;
  if (!vendorOrg) {
    return (
      <AppFrame userId={ctx.actor.userId} active="bookings" title={t('bookingsTitle')}>
        <EmptyState icon={<Briefcase className="size-8" aria-hidden />} title={t('noBookings')} body="" />
      </AppFrame>
    );
  }
  const [rows, day, replies, earnings] = await Promise.all([
    listVendorBookingMoney(ctx.actor, { vendorOrgId: vendorOrg.id }),
    vendorDayTasks(ctx.actor, vendorOrg.id).catch(() => null),
    pendingReplies(vendorOrg.id).catch(() => []),
    vendorEarnings(ctx.actor, vendorOrg.id).catch(() => []),
  ]);
  const dayByBooking = new Map((day?.bookings ?? []).map((row) => [row.bookingId, row]));
  return (
    <AppFrame userId={ctx.actor.userId} active="bookings" title={t('bookingsTitle')}>
      <div className="flex flex-col gap-4 py-2">
        {earnings[0] && <EarningsPanel summary={earnings[0]} />}
        <VendorReplies rows={replies.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))} />
        {rows.length === 0 ? (
          <EmptyState icon={<Briefcase className="size-8" aria-hidden />} title={t('noBookings')} body="" />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((b) => {
              const tasks = dayByBooking.get(b.id);
              const starts = b.startsAt ? new Date(b.startsAt) : null;
              // D-X79: day-of controls only on the day (12 h before to 36 h after the start)
              // for a booking that is confirmed, never on every booking.
              const onTheDay =
                tasks !== undefined &&
                (tasks.arrivedAt !== null || (b.status === 'CONFIRMED' && starts !== null && isEventDay(starts)));
              const tone =
                b.status === 'CONFIRMED' || b.status === 'COMPLETED'
                  ? 'success'
                  : b.status === 'DEPOSIT_DUE'
                    ? 'warning'
                    : 'neutral';
              return (
                <li key={b.id} className="flex flex-col gap-2">
                  <Link
                    href={`/bookings/${b.id}`}
                    className="group border-border/70 bg-surface flex items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-[var(--shadow-1)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]"
                  >
                    <span className="bg-brand-soft text-brand-strong grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold">
                      {b.eventName.trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{b.eventName}</p>
                      <p className="text-muted flex items-center gap-1.5 truncate text-xs">
                        <CalendarDays aria-hidden className="size-3.5 shrink-0" />
                        {starts
                          ? new Intl.DateTimeFormat(undefined, {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            }).format(starts)
                          : tv('noDate')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums">
                        <MoneyText
                          value={b.outstandingMinor === '0' ? b.securedMinor : b.outstandingMinor}
                          currency={b.currency}
                        />
                      </span>
                      <StatusPill tone={tone}>
                        {tb.has(`status.${b.status}`) ? tb(`status.${b.status}`) : b.status}
                      </StatusPill>
                    </div>
                  </Link>
                  {onTheDay && tasks && (
                    <VendorDayCard
                      row={{
                        ...tasks,
                        startsAt: tasks.startsAt?.toISOString() ?? null,
                        arrivedAt: tasks.arrivedAt?.toISOString() ?? null,
                        items: tasks.items.map((item) => ({ ...item, startsAt: item.startsAt.toISOString() })),
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}
