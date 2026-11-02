import { listMyOrgs, listVendorBookingMoney, pendingReplies, vendorDayTasks } from '@tiwa/core';
import { Card, EmptyState, MoneyText, StatusPill } from '@tiwa/ui';
import { Briefcase } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { VendorDayCard } from './vendor-day.js';
import { VendorReplies } from './vendor-replies.js';

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
  const [rows, day, replies] = await Promise.all([
    listVendorBookingMoney(ctx.actor, { vendorOrgId: vendorOrg.id }),
    vendorDayTasks(ctx.actor, vendorOrg.id).catch(() => null),
    pendingReplies(vendorOrg.id).catch(() => []),
  ]);
  const dayByBooking = new Map((day?.bookings ?? []).map((row) => [row.bookingId, row]));
  return (
    <AppFrame userId={ctx.actor.userId} active="bookings" title={t('bookingsTitle')}>
      <div className="flex flex-col gap-3 py-2">
        <VendorReplies rows={replies.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))} />
        {rows.length === 0 ? (
          <EmptyState icon={<Briefcase className="size-8" aria-hidden />} title={t('noBookings')} body="" />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((b) => {
              const tasks = dayByBooking.get(b.id);
              return (
                <li key={b.id} className="flex flex-col gap-2">
                  <Link href={`/bookings/${b.id}`} className="group">
                    <Card className="group-hover:border-brand/50 flex items-center justify-between gap-3 p-3 transition-colors">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{b.eventName}</p>
                        <StatusPill tone={b.status === 'CONFIRMED' ? 'success' : 'neutral'}>
                          {tb.has(`status.${b.status}`) ? tb(`status.${b.status}`) : b.status}
                        </StatusPill>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-muted text-xs">
                          {b.outstandingMinor === '0' ? tv('money.secured') : tv('money.outstanding')}
                        </p>
                        <p className="font-semibold">
                          <MoneyText
                            value={b.outstandingMinor === '0' ? b.securedMinor : b.outstandingMinor}
                            currency={b.currency}
                          />
                        </p>
                      </div>
                    </Card>
                  </Link>
                  {tasks && (
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
