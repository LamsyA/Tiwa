import { listMyOrgs, plannerCalendar, vendorDashboard } from '@tiwa/core';
import { Card } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
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

  const active = plannerOrg ? 'calendar' : 'calendar';
  return (
    <AppFrame userId={ctx.actor.userId} active={active} title={t('calendarTitle')}>
      <div className="flex flex-col gap-4 py-2">
        {plannerEvents.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">{t('calendarTitle')}</h2>
            <ul className="flex flex-col gap-2">
              {plannerEvents.map((e) => (
                <li key={e.id} className="text-sm">
                  <Link href={`/events/${e.id}`} className="text-brand-strong font-medium">
                    {e.name}
                  </Link>
                  <span className="text-muted"> · {e.startsAt ? new Date(e.startsAt).toLocaleDateString() : '—'}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {vendorDash && (
          <Card>
            <h2 className="mb-2 font-semibold">{t('calendarTitle')}</h2>
            <ul className="flex flex-col gap-2">
              {vendorDash.upcomingBookings.map((b) => (
                <li key={b.id} className="text-sm">
                  <Link href={`/quotes`} className="text-brand-strong font-medium">
                    {b.eventName}
                  </Link>
                  <span className="text-muted"> · {b.startsAt ? new Date(b.startsAt).toLocaleDateString() : '—'}</span>
                </li>
              ))}
            </ul>
            {vendorDash.doubleBookingWarnings.length > 0 && (
              <p className="text-warning mt-2 text-sm">
                {vendorDash.doubleBookingWarnings.map((w) => w.date).join(', ')}
              </p>
            )}
          </Card>
        )}
        {plannerEvents.length === 0 && !vendorDash && <p className="text-muted text-sm">{t('noEvents')}</p>}
      </div>
    </AppFrame>
  );
}
