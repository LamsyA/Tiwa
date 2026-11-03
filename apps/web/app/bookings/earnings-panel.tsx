import type { EarningsSummary } from '@tiwa/core';
import { MoneyText, cn } from '@tiwa/ui';
import { AlertCircle, CalendarClock, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

/** Vendor earnings at a glance (D-X46): this month, upcoming, overdue, six-month bars. */
export async function EarningsPanel({ summary }: { summary: EarningsSummary }) {
  const t = await getTranslations('vendor.earnings');
  const max = summary.trend.reduce((top, point) => (point.minor > top ? point.minor : top), 0n);
  const change =
    summary.lastMonthMinor > 0n
      ? Number(((summary.thisMonthMinor - summary.lastMonthMinor) * 100n) / summary.lastMonthMinor)
      : null;
  const monthName = (month: string) =>
    new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <section
      aria-labelledby="earnings-heading"
      className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--brand-strong)_88%,black)_0%,#140b07_100%)] p-5 text-white shadow-[0_24px_60px_-28px_rgb(0_0_0/0.55)] sm:p-7"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-white/10 blur-3xl"
      />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <div>
          <p id="earnings-heading" className="inline-flex items-center gap-2 text-sm font-medium text-white/70">
            <Wallet aria-hidden className="size-4" />
            {t('thisMonth')}
          </p>
          <p className="font-display mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
            <MoneyText value={summary.thisMonthMinor} currency={summary.currency} />
          </p>
          {change !== null && (
            <p
              className={cn(
                'mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                change >= 0 ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/15 text-rose-200',
              )}
            >
              {change >= 0 ? (
                <TrendingUp aria-hidden className="size-3.5" />
              ) : (
                <TrendingDown aria-hidden className="size-3.5" />
              )}
              {t('vsLastMonth', { percent: Math.abs(change), direction: change >= 0 ? 'up' : 'down' })}
            </p>
          )}
          <dl className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10 backdrop-blur">
              <dt className="inline-flex items-center gap-1.5 text-xs text-white/70">
                <CalendarClock aria-hidden className="size-3.5" />
                {t('upcoming', { count: summary.upcomingCount })}
              </dt>
              <dd className="font-display mt-1 text-xl font-bold tabular-nums">
                <MoneyText value={summary.upcomingMinor} currency={summary.currency} />
              </dd>
            </div>
            <div
              className={cn(
                'rounded-2xl p-3.5 ring-1 backdrop-blur',
                summary.overdueCount > 0 ? 'bg-rose-500/15 ring-rose-300/30' : 'bg-white/[0.07] ring-white/10',
              )}
            >
              <dt className="inline-flex items-center gap-1.5 text-xs text-white/70">
                <AlertCircle aria-hidden className="size-3.5" />
                {t('overdue', { count: summary.overdueCount })}
              </dt>
              <dd className="font-display mt-1 text-xl font-bold tabular-nums">
                <MoneyText value={summary.overdueMinor} currency={summary.currency} />
              </dd>
            </div>
          </dl>
        </div>
        <figure>
          <figcaption className="sr-only">{t('trend')}</figcaption>
          <ol className="flex h-36 items-end gap-2 sm:gap-3">
            {summary.trend.map((point, index) => {
              const height = max > 0n ? Math.max(4, Number((point.minor * 100n) / max)) : 4;
              const current = index === summary.trend.length - 1;
              return (
                <li key={point.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span
                    className={cn(
                      'w-full rounded-t-lg transition-[height] duration-700',
                      current ? 'bg-white' : 'bg-white/25 hover:bg-white/40',
                    )}
                    style={{ height: `${height}%` }}
                    title={`${monthName(point.month)}`}
                  />
                  <span className={cn('text-[11px] font-medium', current ? 'text-white' : 'text-white/55')}>
                    {monthName(point.month)}
                  </span>
                </li>
              );
            })}
          </ol>
        </figure>
      </div>
      <p className="mt-5 text-xs text-white/55">{t('note')}</p>
    </section>
  );
}
