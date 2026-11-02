import { listMyOrgs, listVendorBookingMoney, pendingReplies, vendorDayTasks } from '@tiwa/core';
import { Badge, Card, EmptyState } from '@tiwa/ui';
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
                  <Card className="flex items-center justify-between gap-2 p-3">
                    <div>
                      <Link href="/quotes" className="font-medium">
                        {b.eventName}
                      </Link>
                      <p className="text-muted text-sm">{b.status}</p>
                    </div>
                    <Badge>{b.outstandingMinor === '0' ? b.securedMinor : b.outstandingMinor}</Badge>
                  </Card>
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
