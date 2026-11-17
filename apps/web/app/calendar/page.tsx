import { listMyOrgs, plannerCalendar, vendorDashboard } from '@tiwa/core';
import { EmptyState } from '@tiwa/ui';
import { CalendarDays } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Agenda } from '@/components/agenda.js';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';

/** Calendar across events (PLN-07 planner, VND-03 vendor, P10-T05/T08). */
export default async function CalendarPage() {
  const ctx = await requirePageUser('/calendar');
  const t = await getTranslations('planner');
  const orgs = await listMyOrgs(ctx.actor.userId);
  const plannerOrg = orgs.find((r) => r.org.kind === 'PLANNER')?.org;
  const vendorOrg = orgs.find((r) => r.org.kind === 'VENDOR')?.org;

  const plannerEvents = plannerOrg ? await plannerCalendar(ctx.actor, plannerOrg.id) : [];
  const vendorDash = vendorOrg ? await vendorDashboard(ctx.actor, { orgId: vendorOrg.id }) : null;

  const labels = {
    today: t('todayPill'),
    inDays: (count: number) => t('inDays', { count }),
    past: t('past'),
    noDate: t('noDate'),
  };
  return (
    <AppFrame userId={ctx.actor.userId} active="calendar" title={t('calendarTitle')}>
      <div className="flex flex-col gap-4 py-2">
        {plannerEvents.length > 0 && (
          <Agenda
            labels={labels}
            items={plannerEvents.map((e) => ({
              id: e.id,
              title: e.name,
              href: `/events/${e.id}`,
              startsAt: e.startsAt,
            }))}
          />
        )}
        {vendorDash && vendorDash.upcomingBookings.length > 0 && (
          <Agenda
            labels={labels}
            items={vendorDash.upcomingBookings.map((b) => ({
              id: b.id,
              title: b.eventName,
              href: '/bookings',
              startsAt: b.startsAt,
            }))}
          />
        )}
        {vendorDash && vendorDash.doubleBookingWarnings.length > 0 && (
          <p className="border-warning/40 bg-warning-soft text-warning rounded-2xl border px-4 py-3 text-sm font-medium">
            {vendorDash.doubleBookingWarnings.map((w) => w.date).join(', ')}
          </p>
        )}
        {plannerEvents.length === 0 && (!vendorDash || vendorDash.upcomingBookings.length === 0) && (
          <EmptyState icon={<CalendarDays aria-hidden />} title={t('noEvents')} />
        )}
      </div>
    </AppFrame>
  );
}
