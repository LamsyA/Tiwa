import { prisma } from '@tiwa/db';
import type { AppRole } from '@tiwa/ui';
import { listClients, listMyOrgs, myEventOrders, plannerDashboard, vendorDashboard, vendorOrders } from '@tiwa/core';
import { Badge, Card, EmptyState, StatCard, buttonClasses } from '@tiwa/ui';
import { CalendarCheck, CalendarPlus, FileText, Inbox, Plus, Users, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { RoleBadge } from '@/components/account-menu.js';
import { ROLE_TONE } from '@/components/role-tone.js';
import { AppFrame } from '@/components/app-frame.js';
import { OrdersBoard } from '@/components/orders/orders-board.js';
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
          <section aria-label={to('stagesLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map(({ stage, icon: Icon }) => (
              <Link
                key={stage}
                href={`/orders?stage=${stage}`}
                className="border-border/70 bg-surface group flex flex-col gap-3 rounded-3xl border p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] sm:p-5"
              >
                <span className="bg-brand-soft text-brand-strong flex size-10 items-center justify-center rounded-2xl">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="font-display block text-3xl font-bold tracking-tight">{orders.counts[stage]}</span>
                  <span className="text-muted text-sm">{to(`tile.${stage}`)}</span>
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
        <div className="flex flex-col gap-8 py-2">
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
                      className="border-border/70 bg-surface flex h-full flex-col gap-2 rounded-3xl border p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]"
                    >
                      <span className="font-display text-lg leading-tight font-bold">{event.name}</span>
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

        <OrdersBoard rows={orders.rows} counts={orders.counts} side="client" limit={5} />

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
