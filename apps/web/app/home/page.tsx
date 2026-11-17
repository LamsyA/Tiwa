import { prisma } from '@tiwa/db';
import type { AppRole } from '@tiwa/ui';
import { listClients, listMyOrgs, myEventOrders, plannerDashboard, vendorDashboard, vendorOrders } from '@tiwa/core';
import { EmptyState, buttonClasses } from '@tiwa/ui';
import { AlarmClock, CalendarCheck, CalendarPlus, FileText, Inbox, Plus, Users, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { RoleBadge } from '@/components/account-menu.js';
import { ROLE_TONE } from '@/components/role-tone.js';
import { AppFrame } from '@/components/app-frame.js';
import { OrdersBoard } from '@/components/orders/orders-board.js';
import { requirePageUser } from '@/lib/ctx.js';
import type * as React from 'react';

/** Whole days from now until `date`. */
function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

async function RoleHero({
  role,
  name,
  org,
  actions,
}: {
  role: AppRole;
  name: string;
  org?: string | undefined;
  actions?: React.ReactNode;
}) {
  const t = await getTranslations('account');
  const tone = ROLE_TONE[role];
  return (
    <section
      className="relative overflow-hidden rounded-3xl px-5 py-4 text-white shadow-[var(--shadow-2)] sm:px-6 sm:py-5"
      style={{
        background: `linear-gradient(120deg, color-mix(in oklab, ${tone} 90%, black 6%) 0%, color-mix(in oklab, ${tone} 60%, black 32%) 100%)`,
      }}
    >
      <div aria-hidden className="tiwa-grid-bg absolute inset-0 opacity-15" />
      <span aria-hidden className="absolute -right-10 -bottom-16 size-48 rounded-full bg-[#14b8a6]/35 blur-3xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <span className="mb-1.5 inline-flex w-fit rounded-full bg-white/90 px-0.5 py-0.5">
            <RoleBadge role={role} />
          </span>
          <p className="font-display truncate text-xl font-bold tracking-tight sm:text-2xl">
            {name ? t('greeting', { name: name.split(/\s+/)[0] ?? name }) : t('greetingAnon')}
          </p>
          <p className="truncate text-sm text-white/80">
            {org ? t(`heroBody.${role}Org`, { org }) : t(`heroBody.${role}`)}
          </p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
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
  const to = await getTranslations('orders');
  const [orgs, me] = await Promise.all([
    listMyOrgs(ctx.actor.userId),
    prisma.user.findUniqueOrThrow({ where: { id: ctx.actor.userId }, select: { name: true, phone: true } }),
  ]);
  const myName = me.name && me.name !== me.phone ? me.name : '';
  const plannerOrg = orgs.find((r) => r.org.kind === 'PLANNER')?.org;
  const vendorOrg = !plannerOrg ? orgs.find((r) => r.org.kind === 'VENDOR')?.org : undefined;

  if (vendorOrg) {
    const [dash, orders] = await Promise.all([
      vendorDashboard(ctx.actor, { orgId: vendorOrg.id }),
      vendorOrders(ctx.actor, { orgId: vendorOrg.id }),
    ]);
    const tiles = [
      { stage: 'requested', icon: Inbox },
      { stage: 'quoted', icon: FileText },
      { stage: 'booked', icon: Wallet },
      { stage: 'confirmed', icon: CalendarCheck },
    ] as const;
    return (
      <AppFrame userId={ctx.actor.userId} active="home" title={tv('title')}>
        <div className="flex flex-col gap-6 py-2">
          <RoleHero role="vendor" name={myName} org={vendorOrg.name} />
          <section aria-label={to('stagesLabel')} className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {tiles.map(({ stage, icon: Icon }, index) => (
              <Link
                key={stage}
                href={`/orders?stage=${stage}`}
                className="border-border/70 bg-surface group flex min-w-0 items-center gap-2.5 rounded-2xl border p-3 shadow-[var(--shadow-1)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] sm:p-4"
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    [
                      'bg-brand-soft text-brand-strong',
                      'bg-accent/15 text-[#8a6500]',
                      'bg-teal-soft text-teal-strong',
                      'bg-success-soft text-success',
                    ][index]
                  }`}
                >
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="font-display block text-xl leading-none font-bold tabular-nums">
                    {orders.counts[stage]}
                  </span>
                  <span className="text-muted mt-1 block truncate text-xs">{to(`tile.${stage}`)}</span>
                </span>
              </Link>
            ))}
          </section>
          {dash.doubleBookingWarnings.length > 0 && (
            <p className="border-warning/40 bg-warning-soft text-warning rounded-2xl border px-4 py-3 text-sm font-medium">
              {tv('warningsHeading')}: {dash.doubleBookingWarnings.map((w) => w.date).join(', ')}
            </p>
          )}
          <OrdersBoard rows={orders.rows} counts={orders.counts} side="vendor" limit={6} />
          <div className="flex flex-wrap gap-2">
            <Link href="/business/profile" className={buttonClasses({ variant: 'secondary' })}>
              {to('editProfile')}
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
    const [events, orders] = await Promise.all([
      prisma.event.findMany({
        where: {
          deletedAt: null,
          status: { not: 'CANCELLED' },
          participants: { some: { userId: ctx.actor.userId, removedAt: null, role: { in: ['HOST', 'CO_HOST'] } } },
        },
        orderBy: [{ startsAt: { sort: 'asc', nulls: 'last' } }],
        take: 6,
        select: { id: true, name: true, status: true, startsAt: true, expectedGuests: true },
      }),
      myEventOrders(ctx.actor),
    ]);
    return (
      <AppFrame userId={ctx.actor.userId} active="home" title={t('title')}>
        <div className="flex flex-col gap-5 py-2">
          <RoleHero role="host" name={myName} />
          {events.length === 0 ? (
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
          ) : (
            <section aria-labelledby="my-events" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 id="my-events" className="font-display text-xl font-bold tracking-tight">
                  {t('myEvents')}
                </h2>
                <Link href="/events/new" className={buttonClasses({ size: 'sm', className: 'rounded-full' })}>
                  <Plus aria-hidden className="size-4" />
                  {t('createEvent')}
                </Link>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {events.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={event.status === 'DRAFT' ? `/events/new?id=${event.id}` : `/events/${event.id}`}
                      className="border-border/70 bg-surface flex h-full flex-col gap-1.5 rounded-2xl border p-4 shadow-[var(--shadow-1)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]"
                    >
                      <span className="font-display truncate text-base leading-tight font-bold">{event.name}</span>
                      <span className="text-muted text-sm">
                        {event.startsAt ? event.startsAt.toISOString().slice(0, 10) : t('noDate')}
                        {event.expectedGuests ? ` · ${t('guests', { count: event.expectedGuests })}` : ''}
                      </span>
                      {event.status === 'DRAFT' && (
                        <span className="text-warning mt-auto text-xs font-semibold">{t('draft')}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {orders.rows.length > 0 && <OrdersBoard rows={orders.rows} counts={orders.counts} side="client" limit={5} />}
        </div>
      </AppFrame>
    );
  }

  const [dash, clients, orders] = await Promise.all([
    plannerDashboard(ctx.actor, { orgId: plannerOrg.id }),
    listClients(ctx.actor, { orgId: plannerOrg.id }),
    myEventOrders(ctx.actor),
  ]);

  const stageTotal = dash.pipeline.reduce((sum, row) => sum + row.count, 0);
  const STAGE_COLOR: Record<string, string> = {
    ENQUIRY: 'bg-brand',
    PROPOSAL_SENT: 'bg-accent',
    WON: 'bg-teal',
    LOST: 'bg-border',
  };
  const tiles = [
    {
      key: 'overdue',
      href: '/today',
      icon: AlarmClock,
      value: dash.needsToday.overdueTasks,
      label: tp('tiles.overdue'),
      tone: 'bg-brand-soft text-brand-strong',
    },
    {
      key: 'payments',
      href: '/today',
      icon: Wallet,
      value: dash.needsToday.paymentsDue,
      label: tp('tiles.payments'),
      tone: 'bg-accent/15 text-[#8a6500] dark:text-accent',
    },
    {
      key: 'enquiries',
      href: '/quotes',
      icon: Inbox,
      value: dash.needsToday.openEnquiries,
      label: tp('tiles.enquiries'),
      tone: 'bg-teal-soft text-teal-strong',
    },
  ] as const;

  return (
    <AppFrame userId={ctx.actor.userId} active="home" title={tp('title')}>
      <div className="flex flex-col gap-4 py-2">
        <RoleHero
          role="planner"
          name={myName}
          org={plannerOrg.name}
          actions={
            <>
              <Link
                href="/events/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-[#1c1917] transition hover:bg-white/90"
              >
                <Plus aria-hidden className="size-4" />
                {tp('newEvent')}
              </Link>
              <Link
                href="/clients"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/30 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <Users aria-hidden className="size-4" />
                {tp('addClient')}
              </Link>
            </>
          }
        />

        <section aria-label={tp('needsToday')} className="grid grid-cols-3 gap-2 sm:gap-3">
          {tiles.map(({ key, href, icon: Icon, value, label, tone }) => (
            <Link
              key={key}
              href={href}
              className="border-border/70 bg-surface group flex min-w-0 flex-col gap-2 rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] sm:flex-row sm:items-center sm:gap-3 sm:p-4"
            >
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl sm:size-10 ${tone}`}>
                <Icon aria-hidden className="size-4 sm:size-5" />
              </span>
              <span className="min-w-0">
                <span className="font-display block text-xl leading-none font-bold tabular-nums sm:text-2xl">
                  {value}
                </span>
                <span className="text-muted mt-1 block truncate text-[11px] font-medium sm:text-xs">{label}</span>
              </span>
            </Link>
          ))}
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold tracking-tight">{tp('weekEvents')}</h2>
              <Link href="/calendar" className="text-brand-strong text-xs font-semibold hover:underline">
                {tp('viewAll')}
              </Link>
            </div>
            {dash.weekEvents.length === 0 ? (
              <p className="text-muted text-sm">{tp('noNeeds')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {dash.weekEvents.map((event) => {
                  const start = event.startsAt ? new Date(event.startsAt) : null;
                  const days = start ? daysUntil(start) : null;
                  return (
                    <li key={event.id}>
                      <Link
                        href={`/events/${event.id}`}
                        className="hover:bg-surface-2 group flex items-center gap-3 rounded-2xl p-2 transition"
                      >
                        <span className="bg-bg border-border/70 flex w-11 shrink-0 flex-col items-center rounded-xl border py-1 shadow-[var(--shadow-1)]">
                          <span className="text-brand-strong text-[10px] font-bold uppercase">
                            {start ? new Intl.DateTimeFormat('en', { month: 'short' }).format(start) : '—'}
                          </span>
                          <span className="font-display text-base leading-none font-bold">
                            {start ? start.getDate() : ''}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{event.name}</span>
                          <span className="text-muted block truncate text-xs">
                            {start
                              ? new Intl.DateTimeFormat('en', {
                                  weekday: 'long',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                }).format(start)
                              : ''}
                          </span>
                        </span>
                        {days !== null && days >= 0 && (
                          <span className="bg-teal-soft text-teal-strong shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                            {days === 0 ? tp('todayPill') : tp('inDays', { count: days })}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold tracking-tight">{tp('pipeline')}</h2>
              <Link href="/pipeline" className="text-brand-strong text-xs font-semibold hover:underline">
                {tp('viewAll')}
              </Link>
            </div>
            <div className="bg-surface-2 flex h-2.5 overflow-hidden rounded-full" aria-hidden>
              {stageTotal > 0 &&
                dash.pipeline.map((row) => (
                  <span
                    key={row.stage}
                    className={STAGE_COLOR[row.stage]}
                    style={{ width: `${(row.count / stageTotal) * 100}%` }}
                  />
                ))}
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {(['ENQUIRY', 'PROPOSAL_SENT', 'WON', 'LOST'] as const).map((stage) => (
                <li key={stage}>
                  <Link
                    href="/pipeline"
                    className="hover:bg-surface-2 flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition"
                  >
                    <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${STAGE_COLOR[stage]}`} />
                    <span className="text-muted min-w-0 flex-1 truncate text-xs">{tp(`stages.${stage}`)}</span>
                    <span className="font-semibold tabular-nums">
                      {dash.pipeline.find((row) => row.stage === stage)?.count ?? 0}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {clients.length === 0 && <p className="text-muted text-xs">{tp('emptyClients')}</p>}
          </section>
        </div>

        <OrdersBoard rows={orders.rows} counts={orders.counts} side="client" limit={5} />
      </div>
    </AppFrame>
  );
}
