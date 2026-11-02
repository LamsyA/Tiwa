import { prisma } from '@tiwa/db';
import type { AppRole } from '@tiwa/ui';
import { listClients, listMyOrgs, plannerDashboard, vendorDashboard } from '@tiwa/core';
import { Badge, Card, EmptyState, StatCard, buttonClasses } from '@tiwa/ui';
import { CalendarPlus, Plus, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ROLE_TONE, RoleBadge } from '@/components/account-menu.js';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';

async function RoleHero({ role, name, org }: { role: AppRole; name: string; org?: string | undefined }) {
  const t = await getTranslations('account');
  const tone = ROLE_TONE[role];
  return (
    <section
      className="relative overflow-hidden rounded-3xl p-6 text-white shadow-[var(--shadow-2)] sm:p-8"
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, ${tone} 88%, black 8%), color-mix(in oklab, ${tone} 55%, black 35%))`,
      }}
    >
      <div aria-hidden className="tiwa-grid-bg absolute inset-0 opacity-20" />
      <div className="relative flex flex-col gap-2">
        <span className="w-fit rounded-full bg-white/90 px-0.5 py-0.5">
          <RoleBadge role={role} />
        </span>
        <p className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {name ? t('greeting', { name: name.split(/\s+/)[0] ?? name }) : t('greetingAnon')}
        </p>
        <p className="text-sm text-white/80 sm:text-base">
          {org ? t(`heroBody.${role}Org`, { org }) : t(`heroBody.${role}`)}
        </p>
      </div>
    </section>
  );
}

/** Role home (PLN-01 planner, VND vendor, UF-21): needs-today, lists, quick actions. */
export default async function HomePage() {
  const ctx = await requirePageUser('/home');
  const t = await getTranslations('home');
  const tp = await getTranslations('planner');
  const tv = await getTranslations('vendor');
  const [orgs, me] = await Promise.all([
    listMyOrgs(ctx.actor.userId),
    prisma.user.findUniqueOrThrow({ where: { id: ctx.actor.userId }, select: { name: true, phone: true } }),
  ]);
  const myName = me.name && me.name !== me.phone ? me.name : '';
  const plannerOrg = orgs.find((r) => r.org.kind === 'PLANNER')?.org;
  const vendorOrg = !plannerOrg ? orgs.find((r) => r.org.kind === 'VENDOR')?.org : undefined;

  if (vendorOrg) {
    const dash = await vendorDashboard(ctx.actor, { orgId: vendorOrg.id });
    return (
      <AppFrame userId={ctx.actor.userId} active="home" title={tv('title')}>
        <div className="flex flex-col gap-4 py-2">
          <RoleHero role="vendor" name={myName} org={vendorOrg.name} />
          <section aria-label={tv('title')} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              label={tv('enquiriesHeading')}
              value={String(dash.needsToday.openEnquiries)}
              help={tv('viewQuotes')}
            />
            <StatCard
              label={tv('upcomingHeading')}
              value={String(dash.needsToday.upcomingBookings)}
              help={tv('viewBookings')}
            />
            <StatCard
              label={tv('paymentsHeading')}
              value={String(dash.needsToday.awaitingPayment)}
              help={tv('viewBookings')}
            />
          </section>
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">{tv('upcomingHeading')}</h2>
              <Link href="/bookings" className={buttonClasses({ variant: 'ghost' })}>
                {tp('viewAll')}
              </Link>
            </div>
            {dash.upcomingBookings.length === 0 ? (
              <p className="text-muted text-sm">{tv('noBookings')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {dash.upcomingBookings.map((b) => (
                  <li key={b.id} className="text-sm">
                    <Link href="/quotes" className="text-brand-strong font-medium">
                      {b.eventName}
                    </Link>
                    <span className="text-muted"> · {b.status}</span>
                  </li>
                ))}
              </ul>
            )}
            {dash.doubleBookingWarnings.length > 0 && (
              <p className="text-warning mt-2 text-sm">
                {tv('warningsHeading')}: {dash.doubleBookingWarnings.map((w) => w.date).join(', ')}
              </p>
            )}
          </Card>
          <div className="flex flex-wrap gap-2">
            <Link href="/quotes" className={buttonClasses()}>
              {tv('viewQuotes')}
            </Link>
            <Link href="/calendar" className={buttonClasses({ variant: 'secondary' })}>
              {tv('viewCalendar')}
            </Link>
          </div>
        </div>
      </AppFrame>
    );
  }

  if (!plannerOrg) {
    return (
      <AppFrame userId={ctx.actor.userId} active="home" title={t('title')}>
        <div className="flex flex-col gap-6 py-2">
          <RoleHero role="host" name={myName} />
          <EmptyState
            icon={<CalendarPlus className="size-8" aria-hidden />}
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={
              <Link href="/events/new" className={buttonClasses()}>
                {t('createEvent')}
              </Link>
            }
          />
        </div>
      </AppFrame>
    );
  }

  const [dash, clients] = await Promise.all([
    plannerDashboard(ctx.actor, { orgId: plannerOrg.id }),
    listClients(ctx.actor, { orgId: plannerOrg.id }),
  ]);

  return (
    <AppFrame userId={ctx.actor.userId} active="home" title={tp('title')}>
      <div className="flex flex-col gap-4 py-2">
        <RoleHero role="planner" name={myName} org={plannerOrg.name} />
        <section aria-label={tp('needsToday')} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label={tp('needsToday')}
            value={String(dash.needsToday.overdueTasks)}
            help={tp('overdueTasks', { count: dash.needsToday.overdueTasks })}
          />
          <StatCard
            label={tp('weekEvents')}
            value={String(dash.weekEvents.length)}
            help={tp('paymentsDue', { count: dash.needsToday.paymentsDue })}
          />
          <StatCard
            label={tp('pipeline')}
            value={String(dash.totals.clients)}
            help={tp('openEnquiries', { count: dash.needsToday.openEnquiries })}
          />
        </section>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{tp('weekEvents')}</h2>
            <Link href="/events" className={buttonClasses({ variant: 'ghost' })}>
              {tp('viewAll')}
            </Link>
          </div>
          {dash.weekEvents.length === 0 ? (
            <p className="text-muted text-sm">{tp('noNeeds')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dash.weekEvents.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="text-brand-strong text-sm font-medium">
                    {e.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{tp('pipeline')}</h2>
            <Link href="/clients?view=pipeline" className={buttonClasses({ variant: 'ghost' })}>
              {tp('viewAll')}
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {dash.pipeline.map((s) => (
              <Badge key={s.stage}>{`${tp(`stages.${s.stage}`)} · ${s.count}`}</Badge>
            ))}
          </div>
          {clients.length === 0 && <p className="text-muted mt-2 text-sm">{tp('emptyClients')}</p>}
        </Card>

        <div className="flex flex-wrap gap-2">
          <Link href="/events/new" className={buttonClasses()}>
            <Plus aria-hidden className="size-5" />
            {tp('newEvent')}
          </Link>
          <Link href="/clients" className={buttonClasses({ variant: 'secondary' })}>
            <Users aria-hidden className="size-5" />
            {tp('addClient')}
          </Link>
        </div>
      </div>
    </AppFrame>
  );
}
