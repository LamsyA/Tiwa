import { listMyOrgs, plannerToday, type TodayItem } from '@tiwa/core';
import { DateText, EmptyState, MoneyText, TiwaMark, cn } from '@tiwa/ui';
import {
  AlertCircle,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  PartyPopper,
  Sun,
  Wallet,
} from 'lucide-react';
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
        <section className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(140deg,color-mix(in_oklab,var(--brand-strong)_92%,black)_0%,color-mix(in_oklab,var(--brand-strong)_55%,#1c1917)_55%,#1c1917_100%)] p-5 text-white shadow-[0_24px_60px_-28px_rgb(0_0_0/0.55)] sm:p-7">
          {/* Warm gold glow + the canopy mark as a quiet watermark (D-X99 brand). */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-28 -right-20 -z-10 size-80 rounded-full bg-[#f2b705]/20 blur-3xl"
          />
          <TiwaMark
            size={220}
            className="pointer-events-none absolute -right-4 -bottom-10 -z-10 hidden text-white/[0.06] sm:block"
          />
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white/80 ring-1 ring-white/15">
            <Sun aria-hidden className="size-3.5 text-[#f2b705]" />
            <DateText value={now} format="date" />
          </p>
          <p className="font-display mt-3 text-[1.75rem] leading-tight font-bold tracking-tight sm:text-4xl">
            {total === 0 ? t('clearHeading') : t('heading', { count: total })}
          </p>
          <p className="mt-1 text-sm text-white/65">{t('greeting')}</p>
          <dl className="mt-5 grid grid-cols-3 gap-2 sm:max-w-lg sm:gap-3">
            {(
              [
                ['tasks', today.tasks.length, CheckSquare],
                ['run', today.run.length, CalendarClock],
                ['payments', today.payments.length, Wallet],
              ] as const
            ).map(([key, value, Icon]) => (
              <div
                key={key}
                className={cn(
                  'rounded-2xl px-3 py-2.5 ring-1 backdrop-blur sm:px-4 sm:py-3',
                  value > 0 ? 'bg-white/[0.12] ring-white/20' : 'bg-white/[0.05] ring-white/10',
                )}
              >
                <dt className="flex items-center gap-1 text-[10px] font-medium tracking-wide whitespace-nowrap text-white/70 uppercase sm:gap-1.5 sm:text-[11px]">
                  <Icon aria-hidden className="size-3 shrink-0 sm:size-3.5" />
                  {t(`stat.${key}`)}
                </dt>
                <dd
                  className={cn('font-display mt-0.5 text-2xl font-bold tabular-nums', value === 0 && 'text-white/50')}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {overdue > 0 && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-700 shadow-sm">
              <AlertCircle aria-hidden className="size-3.5" />
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
          (() => {
            const columns = [
              {
                key: 'tasks',
                icon: CheckSquare,
                title: t('tasksHeading'),
                empty: t('tasksEmpty'),
                items: today.tasks,
                href: (row: TodayItem) => `/events/${row.eventId}/plan`,
                overdueLabel: t('overdueTag'),
                time: false,
              },
              {
                key: 'run',
                icon: CalendarClock,
                title: t('runHeading'),
                empty: t('runEmpty'),
                items: today.run,
                href: (row: TodayItem) => `/events/${row.eventId}/day`,
                overdueLabel: t('lateTag'),
                time: true,
              },
              {
                key: 'payments',
                icon: Wallet,
                title: t('paymentsHeading'),
                empty: t('paymentsEmpty'),
                items: today.payments,
                href: (row: TodayItem) => `/events/${row.eventId}/money?tab=payments`,
                overdueLabel: t('overdueTag'),
                time: false,
              },
            ];
            const busy = columns.filter((col) => col.items.length > 0);
            const quiet = columns.filter((col) => col.items.length === 0);
            return (
              <div className="flex flex-col gap-4">
                <div
                  className={cn(
                    'grid grid-cols-1 items-start gap-4',
                    busy.length > 1 && 'lg:grid-cols-2',
                    busy.length > 2 && 'xl:grid-cols-3',
                  )}
                >
                  {busy.map(({ key, ...col }) => (
                    <Column key={key} {...col} showMore={(count) => t('showMore', { count })} />
                  ))}
                </div>
                {quiet.length > 0 && (
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {quiet.map(({ key, icon: Icon, title, empty }) => (
                      <li
                        key={key}
                        className="border-border/70 bg-surface flex items-center gap-3 rounded-2xl border px-4 py-3"
                      >
                        <span className="bg-surface-2 text-muted grid size-8 shrink-0 place-items-center rounded-xl">
                          <Icon aria-hidden className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{title}</span>
                          <span className="text-muted block text-xs">{empty}</span>
                        </span>
                        <span className="text-success ml-auto text-xs font-semibold">{t('allClear')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()
        )}
      </div>
    </AppFrame>
  );
}

const VISIBLE = 5;

function Column({
  icon: Icon,
  title,
  items,
  href,
  overdueLabel,
  time,
  showMore,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  empty: string;
  items: TodayItem[];
  href: (row: TodayItem) => string;
  overdueLabel: string;
  time?: boolean;
  showMore: (count: number) => string;
}) {
  const overdue = items.filter((row) => row.overdue).length;
  const rows = (list: TodayItem[]) =>
    list.map((row) => (
      <li key={row.id}>
        <Link
          href={href(row)}
          className="group hover:bg-surface-2/70 relative flex items-center gap-3 rounded-2xl py-2.5 pr-2 pl-4 transition"
        >
          <span
            aria-hidden
            className={cn(
              'absolute top-2.5 bottom-2.5 left-1 w-1 rounded-full',
              row.overdue ? 'bg-danger' : 'bg-brand/60',
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{row.title}</span>
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
              <MoneyText value={row.amountMinor} currency={row.currency} className="text-sm font-bold tabular-nums" />
            )}
            {row.overdue && (
              <span className="bg-danger/10 text-danger rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                {overdueLabel}
              </span>
            )}
          </span>
          <ChevronRight
            aria-hidden
            className="text-muted size-4 shrink-0 opacity-0 transition group-hover:opacity-100"
          />
        </Link>
      </li>
    ));
  const first = items.slice(0, VISIBLE);
  const rest = items.slice(VISIBLE);
  return (
    <section className="border-border/70 bg-surface flex flex-col gap-2 rounded-3xl border p-3 shadow-[var(--shadow-1)] sm:p-4">
      <h2 className="flex items-center gap-2.5 px-1 pt-1 font-semibold">
        <span className="bg-brand-soft text-brand-strong grid size-9 place-items-center rounded-xl">
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block leading-tight">{title}</span>
          {overdue > 0 && (
            <span className="text-danger block text-xs font-medium">
              {overdue} {overdueLabel.toLowerCase()}
            </span>
          )}
        </span>
        <span className="bg-surface-2 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums">
          {items.length}
        </span>
      </h2>
      <ul className="divide-border/60 flex flex-col divide-y">{rows(first)}</ul>
      {rest.length > 0 && (
        <details className="group/more">
          <summary className="text-brand-strong hover:bg-brand-soft/50 flex cursor-pointer list-none items-center justify-center gap-1 rounded-xl py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span className="group-open/more:hidden">{showMore(rest.length)}</span>
            <ChevronDown aria-hidden className="size-4 transition group-open/more:rotate-180" />
          </summary>
          <ul className="divide-border/60 flex flex-col divide-y border-border/60 border-t">{rows(rest)}</ul>
        </details>
      )}
    </section>
  );
}
