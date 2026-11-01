import { listMyOrgs, listVendorBookingMoney } from '@tiwa/core';
import { Badge, Card, EmptyState } from '@tiwa/ui';
import { Briefcase } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';

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
  const rows = await listVendorBookingMoney(ctx.actor, { vendorOrgId: vendorOrg.id });
  return (
    <AppFrame userId={ctx.actor.userId} active="bookings" title={t('bookingsTitle')}>
      <div className="flex flex-col gap-3 py-2">
        {rows.length === 0 ? (
          <EmptyState icon={<Briefcase className="size-8" aria-hidden />} title={t('noBookings')} body="" />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((b) => (
              <li key={b.id}>
                <Card className="flex items-center justify-between gap-2 p-3">
                  <div>
                    <Link href="/quotes" className="font-medium">
                      {b.eventName}
                    </Link>
                    <p className="text-muted text-sm">{b.status}</p>
                  </div>
                  <Badge>{b.outstandingMinor === '0' ? b.securedMinor : b.outstandingMinor}</Badge>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}
