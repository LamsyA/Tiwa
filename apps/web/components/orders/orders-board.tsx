import type { OrderRow, OrderStage } from '@tiwa/core';
import { MoneyText } from '@tiwa/ui';
import { ArrowRight, CalendarDays, Inbox } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

// Order tracking UI (D-X35): stage pills with counts, then one card per order
// with a five-step track and the next action for whoever is looking.

const TRACK: OrderStage[] = ['requested', 'quoted', 'booked', 'confirmed', 'completed'];
const FILTERS: (OrderStage | 'all')[] = ['all', 'requested', 'quoted', 'booked', 'confirmed', 'delivered', 'completed'];

/** Stages where it's my move (highlighted). */
const MY_MOVE: Record<'vendor' | 'client', OrderStage[]> = {
  vendor: ['requested', 'delivered'],
  client: ['quoted', 'booked', 'delivered'],
};

export function orderHref(row: OrderRow, side: 'vendor' | 'client'): string {
  if (side === 'vendor') return row.requestId ? `/quotes/${row.requestId}` : '/bookings';
  if (row.bookingId) return `/events/${row.eventId}/bookings/${row.bookingId}`;
  return row.categoryKey ? `/events/${row.eventId}/vendors/${row.categoryKey}` : `/events/${row.eventId}/vendors`;
}

function trackIndex(stage: OrderStage) {
  if (stage === 'delivered') return 3.5;
  return TRACK.indexOf(stage);
}

export async function OrdersBoard({
  rows,
  counts,
  side,
  stage = 'all',
  baseHref,
  limit,
}: {
  rows: OrderRow[];
  counts: Record<OrderStage, number>;
  side: 'vendor' | 'client';
  stage?: OrderStage | 'all';
  /** Where the stage pills link to (adds ?stage=…); omit to hide the pills. */
  baseHref?: string;
  limit?: number;
}) {
  const t = await getTranslations('orders');
  const open = rows.filter((row) => row.stage !== 'closed');
  const shown = (stage === 'all' ? open : open.filter((row) => row.stage === stage)).slice(0, limit ?? 200);
  const total = open.length;

  return (
    <section aria-labelledby="orders-heading" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="orders-heading" className="font-display text-xl font-bold tracking-tight">
            {t(side === 'vendor' ? 'vendorHeading' : 'clientHeading')}
          </h2>
          <p className="text-muted text-sm">{t(side === 'vendor' ? 'vendorBody' : 'clientBody')}</p>
        </div>
        {limit && total > limit && (
          <Link href="/orders" className="text-brand-strong shrink-0 text-sm font-semibold hover:underline">
            {t('viewAll', { count: total })}
          </Link>
        )}
      </div>

      {baseHref && (
        <nav aria-label={t('stagesLabel')} className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((key) => {
            const count = key === 'all' ? total : counts[key];
            const active = stage === key;
            const mine = key !== 'all' && MY_MOVE[side].includes(key) && count > 0;
            return (
              <Link
                key={key}
                href={key === 'all' ? baseHref : `${baseHref}?stage=${key}`}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  active ? 'border-text bg-text text-bg' : 'border-border/70 bg-surface text-muted hover:text-text'
                }`}
              >
                {t(`stage.${key}`)}
                <span
                  className={`rounded-full px-1.5 text-xs font-semibold ${
                    active ? 'bg-bg/20' : mine ? 'bg-brand text-on-brand' : 'bg-surface-2'
                  }`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {shown.length === 0 ? (
        <div className="border-border/70 bg-surface flex flex-col items-center gap-2 rounded-3xl border border-dashed px-6 py-12 text-center">
          <span className="bg-brand-soft text-brand-strong flex size-12 items-center justify-center rounded-2xl">
            <Inbox aria-hidden className="size-6" />
          </span>
          <p className="font-semibold">{t(side === 'vendor' ? 'emptyVendor' : 'emptyClient')}</p>
          <p className="text-muted max-w-sm text-sm">{t(side === 'vendor' ? 'emptyVendorBody' : 'emptyClientBody')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((row) => {
            const step = trackIndex(row.stage);
            const mine = MY_MOVE[side].includes(row.stage);
            return (
              <li key={row.id}>
                <Link
                  href={orderHref(row, side)}
                  className={`group bg-surface flex flex-col gap-4 rounded-3xl border p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] sm:p-5 ${
                    mine ? 'border-brand/50 shadow-[var(--shadow-1)]' : 'border-border/70'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="bg-brand-soft text-brand-strong flex size-11 shrink-0 items-center justify-center rounded-2xl text-base font-bold">
                      {(row.counterparty || '?').slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 font-semibold">
                        <span className="truncate">{row.counterparty || t('unknownParty')}</span>
                        {row.category && <span className="text-muted text-sm font-normal">· {row.category}</span>}
                      </p>
                      <p className="text-muted flex items-center gap-1.5 truncate text-sm">
                        <CalendarDays aria-hidden className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {row.eventName}
                          {row.date ? ` · ${row.date.slice(0, 10)}` : ''}
                        </span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {row.amountMinor && row.currency && (
                        <p className="font-semibold">
                          <MoneyText value={row.amountMinor} currency={row.currency} />
                        </p>
                      )}
                      <p className={`mt-0.5 text-xs font-semibold ${mine ? 'text-brand-strong' : 'text-muted'}`}>
                        {t(`next.${side}.${row.stage}`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ol className="flex flex-1 items-center gap-1" aria-label={t(`stage.${row.stage}`)}>
                      {TRACK.map((key, index) => (
                        <li key={key} className="flex flex-1 flex-col gap-1">
                          <span
                            className={`h-1.5 rounded-full ${
                              index <= step ? 'bg-brand' : 'bg-border'
                            } ${index === Math.floor(step) && mine ? 'tiwa-shimmer' : ''}`}
                          />
                          <span
                            className={`hidden text-[11px] sm:block ${index <= step ? 'text-text font-medium' : 'text-muted'}`}
                          >
                            {t(`stage.${key}`)}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <ArrowRight
                      aria-hidden
                      className="text-muted size-4 shrink-0 transition group-hover:translate-x-0.5"
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
