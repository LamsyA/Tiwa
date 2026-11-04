import { budgetSummary, listMyEvents } from '@tiwa/core';
import { Card, DateText, EmptyState, MoneyText, StatCard, buttonClasses } from '@tiwa/ui';
import { ArrowRight, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';

/**
 * Money across all my events (D-X63): the host sidebar's Money item. Each
 * event's figures come from budgetSummary, which enforces money.view, so
 * events this person cannot see money on are left out. Totals are grouped
 * by currency; amounts are never added across currencies.
 */
export default async function MoneyPage() {
  const ctx = await requirePageUser('/money');
  const t = await getTranslations('moneyHub');
  const [upcoming, past] = await Promise.all([
    listMyEvents(ctx.actor.userId, 'upcoming'),
    listMyEvents(ctx.actor.userId, 'past'),
  ]);
  const rows = (
    await Promise.all(
      [...upcoming, ...past].map(async (event) => {
        const summary = await budgetSummary(ctx.actor, { eventId: event.id }).catch(() => null);
        return summary ? { event, currency: summary.currency, totals: summary.totals } : null;
      }),
    )
  ).filter((row) => row !== null);

  const byCurrency = new Map<string, { planned: bigint; committed: bigint; paid: bigint; outstanding: bigint }>();
  for (const row of rows) {
    const sum = byCurrency.get(row.currency) ?? { planned: 0n, committed: 0n, paid: 0n, outstanding: 0n };
    sum.planned += row.totals.plannedMinor;
    sum.committed += row.totals.committedMinor;
    sum.paid += row.totals.paidMinor;
    sum.outstanding += row.totals.outstandingMinor;
    byCurrency.set(row.currency, sum);
  }

  return (
    <AppFrame userId={ctx.actor.userId} active="money" title={t('title')}>
      <div className="flex flex-col gap-6 py-2">
        <p className="text-muted max-w-2xl">{t('intro')}</p>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Wallet className="size-8" aria-hidden />}
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={
              <Link href="/events/new" className={buttonClasses()}>
                {t('newEvent')}
              </Link>
            }
          />
        ) : (
          <>
            {[...byCurrency.entries()].map(([currency, sum]) => (
              <div key={currency} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label={t('planned')} value={<MoneyText value={sum.planned} currency={currency} />} />
                <StatCard label={t('committed')} value={<MoneyText value={sum.committed} currency={currency} />} />
                <StatCard label={t('paid')} value={<MoneyText value={sum.paid} currency={currency} />} />
                <StatCard label={t('outstanding')} value={<MoneyText value={sum.outstanding} currency={currency} />} />
              </div>
            ))}
            <ul className="grid gap-3 md:grid-cols-2">
              {rows.map(({ event, currency, totals }) => {
                const share =
                  totals.committedMinor > 0n ? Number((totals.paidMinor * 100n) / totals.committedMinor) : 0;
                return (
                  <li key={event.id}>
                    <Card className="flex h-full flex-col gap-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="font-display truncate text-lg font-bold">{event.name}</h2>
                          <p className="text-muted text-sm">
                            {event.startsAt ? <DateText value={event.startsAt} /> : t('noDate')}
                          </p>
                        </div>
                        <Link
                          href={`/events/${event.id}/money`}
                          className="text-brand-strong inline-flex shrink-0 items-center gap-1 text-sm font-semibold hover:underline"
                        >
                          {t('open')}
                          <ArrowRight className="size-4" aria-hidden />
                        </Link>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                        {(
                          [
                            ['planned', totals.plannedMinor],
                            ['committed', totals.committedMinor],
                            ['paid', totals.paidMinor],
                            ['outstanding', totals.outstandingMinor],
                          ] as const
                        ).map(([key, value]) => (
                          <div key={key}>
                            <dt className="text-muted text-xs">{t(key)}</dt>
                            <dd className="font-semibold">
                              <MoneyText value={value} currency={currency} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <div>
                        <div className="bg-surface-2 h-2 overflow-hidden rounded-full" aria-hidden>
                          <div className="bg-brand-strong h-full rounded-full" style={{ width: `${share}%` }} />
                        </div>
                        <p className="text-muted mt-1 text-xs">{t('paidShare', { percent: share })}</p>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </AppFrame>
  );
}
