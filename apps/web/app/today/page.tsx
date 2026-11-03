import { listMyOrgs, plannerToday, type TodayItem } from '@tiwa/core';
import { DateText, EmptyState, MoneyText, cn } from '@tiwa/ui';
import { CalendarClock, CheckSquare, PartyPopper, Sun, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type * as React from 'react';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';

/** Planner Today (D-X47): tasks due, today's run-of-show and payments due, across every event. */
export default async function TodayPage() {
  const ctx = await requirePageUser('/today');
  const t = await getTranslations('planner.today');
  const orgs = await listMyOrgs(ctx.actor.userId);
  const plannerOrg = orgs.find((row) => row.org.kind === 'PLANNER')?.org;
  if (!plannerOrg) {
    return (
      <AppFrame userId={ctx.actor.userId} active="today" title={t('title')}>
        <EmptyState icon={<Sun className="size-8" aria-hidden />} title={t('plannerOnly')} body="" />
      </AppFrame>
    );
  }
  const today = await plannerToday(ctx.actor, plannerOrg.id);
  const total = today.tasks.length + today.run.length + today.payments.length;
  const overdue = [...today.tasks, ...today.payments].filter((row) => row.overdue).length;
  const now = new Date();

  return (
    <AppFrame userId={ctx.actor.userId} active="today" title={t('title')}>
      <div className="flex flex-col gap-5 py-2">
        <section className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--brand-strong)_88%,black)_0%,#140b07_100%)] p-6 text-white shadow-[0_24px_60px_-28px_rgb(0_0_0/0.55)] sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 -z-10 size-72 rounded-full bg-amber-300/20 blur-3xl"
          />
          <p className="inline-flex items-center gap-2 text-sm font-medium text-white/70">
            <Sun aria-hidden className="size-4" />
            <DateText value={now} format="date" />
          </p>
          <p className="font-display mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {total === 0 ? t('clearHeading') : t('heading', { count: total })}
          </p>
          <dl className="mt-6 grid grid-cols-3 gap-3 sm:max-w-lg">
            {(
              [
                ['tasks', today.tasks.length],
                ['run', today.run.length],
                ['payments', today.payments.length],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-2xl bg-white/[0.08] p-3 ring-1 ring-white/10 backdrop-blur">
                <dt className="text-xs text-white/70">{t(`stat.${key}`)}</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {overdue > 0 && (
            <p className="mt-4 inline-flex rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-100 ring-1 ring-rose-300/30">
              {t('overdue', { count: overdue })}
            </p>
          )}
        </section>

        {total === 0 ? (
          <EmptyState
            icon={<PartyPopper className="size-8" aria-hidden />}
            title={t('clearTitle')}
            body={t('clearBody')}
          />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Column
              icon={CheckSquare}
              title={t('tasksHeading')}
              empty={t('tasksEmpty')}
              items={today.tasks}
              href={(row) => `/events/${row.eventId}/plan`}
              overdueLabel={t('overdueTag')}
            />
            <Column
              icon={CalendarClock}
              title={t('runHeading')}
              empty={t('runEmpty')}
              items={today.run}
              href={(row) => `/events/${row.eventId}/day`}
              overdueLabel={t('lateTag')}
              time
            />
            <Column
              icon={Wallet}
              title={t('paymentsHeading')}
              empty={t('paymentsEmpty')}
              items={today.payments}
              href={(row) => `/events/${row.eventId}/money?tab=payments`}
              overdueLabel={t('overdueTag')}
            />
          </div>
        )}
      </div>
    </AppFrame>
  );
}

function Column({
  icon: Icon,
  title,
  empty,
  items,
  href,
  overdueLabel,
  time,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  empty: string;
  items: TodayItem[];
  href: (row: TodayItem) => string;
  overdueLabel: string;
  time?: boolean;
}) {
  return (
    <section className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-4 shadow-[var(--shadow-1)] sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="bg-brand-soft text-brand-strong grid size-8 place-items-center rounded-xl">
          <Icon aria-hidden className="size-4" />
        </span>
        {title}
        <span className="text-muted ml-auto text-sm font-normal tabular-nums">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-muted px-1 py-2 text-sm">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((row) => (
            <li key={row.id}>
              <Link
                href={href(row)}
                className={cn(
                  'hover:bg-surface-2/70 flex items-start gap-3 rounded-2xl px-3 py-2.5 transition',
                  row.overdue && 'bg-danger/5',
                )}
              >
                <span
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', row.overdue ? 'bg-danger' : 'bg-brand')}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.title}</span>
                  <span className="text-muted block truncate text-xs">
                    {row.eventName}
                    {row.at && (
                      <>
                        {' · '}
                        <DateText value={row.at} format={time ? 'time' : 'date'} />
                      </>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {row.amountMinor != null && row.currency && (
                    <MoneyText value={row.amountMinor} currency={row.currency} className="text-sm font-semibold" />
                  )}
                  {row.overdue && (
                    <span className="text-danger text-[11px] font-semibold uppercase">{overdueLabel}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
