import {
  listEnquiries,
  listMyOrgs,
  listPendingChanges,
  listPendingOfflinePayments,
  listSiteVisits,
  listVendorBookingMoney,
} from '@tiwa/core';
import { VENDOR_CATEGORIES } from '@tiwa/config';
import { Banner, Card, EmptyState, StatusPill, buttonClasses } from '@tiwa/ui';
import { Inbox } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ChangeCards } from './change-cards.js';
import { BookingMoneyList } from './booking-money.js';
import { PaymentCards } from './payment-cards.js';
import { DeclineEnquiry } from './decline-enquiry.js';
import { VisitCards } from './visit-cards.js';

/** Vendor quote inbox (VND-01, P7-T04): open briefs with status. Full quotes arrive with P7-T05. */
export default async function QuotesInboxPage() {
  const ctx = await requirePageUser('/quotes');
  const t = await getTranslations('quotes');
  // A section that fails to load says so, instead of quietly looking empty.
  const load = { failed: false };
  const fallback =
    <T,>(value: T) =>
    (error: unknown) => {
      console.error('quotes inbox section failed', error);
      load.failed = true;
      return value;
    };
  const enquiries = await listEnquiries(ctx.actor).catch(() => null);
  const orgs = enquiries === null ? [] : await listMyOrgs(ctx.actor.userId).catch(() => []);
  const vendorOrgIds = (orgs ?? []).filter((row) => row.org.kind === 'VENDOR').map((row) => row.org.id);
  const visits = (
    await Promise.all(
      vendorOrgIds.map((orgId) => listSiteVisits(ctx.actor, { vendorOrgId: orgId }).catch(fallback([]))),
    )
  )
    .flat()
    .map((row) => ({
      id: row.id,
      eventId: 'eventId' in row ? ((row as { eventId?: string | null }).eventId ?? null) : null,
      proposedTimes: row.proposedTimes.map((time) => (time instanceof Date ? time.toISOString() : String(time))),
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
      status: row.status,
      notes: row.notes,
      event: (() => {
        const withEvent = row as unknown as { event?: { name: string; startsAt: Date | null } | null };
        return withEvent.event
          ? { name: withEvent.event.name, startsAt: withEvent.event.startsAt?.toISOString() ?? null }
          : null;
      })(),
    }));
  const changes = (
    await Promise.all(
      vendorOrgIds.map((orgId) => listPendingChanges(ctx.actor, { vendorOrgId: orgId }).catch(fallback([]))),
    )
  ).flat();
  const payments = (
    await Promise.all(
      vendorOrgIds.map((orgId) => listPendingOfflinePayments(ctx.actor, { vendorOrgId: orgId }).catch(fallback([]))),
    )
  ).flat();
  const vendorBookings = (
    await Promise.all(
      vendorOrgIds.map((orgId) => listVendorBookingMoney(ctx.actor, { vendorOrgId: orgId }).catch(fallback([]))),
    )
  ).flat();

  return (
    <AppFrame userId={ctx.actor.userId} active="quotes" title={t('inboxTitle')}>
      <div className="flex flex-col gap-4 py-4">
        <p className="text-muted text-sm">{t('inboxBody')}</p>
        {load.failed && <Banner tone="warning">{t('sectionFailed')}</Banner>}
        <PaymentCards payments={payments} />
        <BookingMoneyList bookings={vendorBookings} />
        <VisitCards visits={visits} />
        <ChangeCards changes={changes} />
        {enquiries === null ? (
          <EmptyState icon={<Inbox className="size-8" aria-hidden />} title={t('noEnquiries')} body="" />
        ) : enquiries.length === 0 ? (
          <EmptyState icon={<Inbox className="size-8" aria-hidden />} title={t('noEnquiries')} body="" />
        ) : (
          <ul className="flex flex-col gap-3">
            {enquiries.map((row) => {
              const brief = row.brief as {
                eventName?: string;
                venue?: string | null;
                expectedGuests?: number | null;
                startsAt?: string | null;
                timezone?: string;
                notes?: string;
              };
              const category = VENDOR_CATEGORIES[row.category as keyof typeof VENDOR_CATEGORIES] ?? row.category;
              const when = brief.startsAt
                ? new Intl.DateTimeFormat('en', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: brief.timezone ?? 'UTC',
                  }).format(new Date(brief.startsAt))
                : null;
              return (
                <li key={row.id}>
                  <Card>
                    <div className="flex flex-col gap-2 p-4">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate font-medium">{brief.eventName ?? row.event.name}</p>
                        <StatusPill tone={row.status === 'OPEN' ? 'brand' : 'neutral'}>
                          {t.has(`enquiry.status.${row.status}`)
                            ? t(`enquiry.status.${row.status}` as 'enquiry.status.OPEN')
                            : row.status}
                        </StatusPill>
                      </div>
                      <p className="text-muted text-sm">
                        {[
                          category,
                          when,
                          brief.venue,
                          typeof brief.expectedGuests === 'number'
                            ? t('enquiry.guests', { count: brief.expectedGuests })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {brief.notes && <p className="bg-surface-2 rounded-xl px-3 py-2 text-sm">“{brief.notes}”</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/quotes/${row.id}`} className={buttonClasses({ className: 'rounded-full' })}>
                          {row.status === 'OPEN' ? t('builderTitle') : t('enquiry.open')}
                        </Link>
                        {row.status === 'OPEN' && <DeclineEnquiry requestId={row.id} />}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}
