'use client';

import { DateText, MoneyText, cn } from '@tiwa/ui';
import { Crown, Pin, PinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export interface CompareQuote {
  id: string;
  vendorName: string;
  status: string;
  totalMinor: string | null;
  currency: string;
  items: { name: string; qty: number; unitMinor: string }[];
  cancellationTerms: string;
  schedule: { label: string; percentBps?: number; amountMinor?: string | null; due: string }[];
  expiresAt: string;
}

function depositMinor(quote: CompareQuote): bigint | null {
  const first = quote.schedule[0];
  if (!first || quote.totalMinor == null) return null;
  if (first.amountMinor) return BigInt(first.amountMinor);
  if (first.percentBps != null) return (BigInt(quote.totalMinor) * BigInt(first.percentBps)) / 10_000n;
  return null;
}

/**
 * Side-by-side quote compare (D-X45). Pin the ones you like (remembered on
 * this device) to see only those; the lowest total wears a crown and every
 * item any vendor offers gets a row so gaps are obvious.
 */
export function CompareTable({
  eventId,
  category,
  quotes,
}: {
  eventId: string;
  category: string;
  quotes: CompareQuote[];
}) {
  const t = useTranslations('quotes.compare');
  const storageKey = `tiwa:pins:${eventId}:${category}`;
  const live = quotes.filter((quote) => !['DECLINED', 'WITHDRAWN', 'EXPIRED', 'DRAFT'].includes(quote.status));
  const [pins, setPins] = React.useState<string[]>([]);
  const [onlyPinned, setOnlyPinned] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[];
      // Read after mount so server and browser render the same first frame.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPins(saved.filter((id) => live.some((quote) => quote.id === id)));
    } catch {
      /* storage unavailable: pins stay in memory */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function toggle(id: string) {
    setPins((current) => {
      const next = current.includes(id) ? current.filter((pin) => pin !== id) : [...current, id];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (live.length < 2) return null;
  const shown = onlyPinned && pins.length > 0 ? live.filter((quote) => pins.includes(quote.id)) : live;
  const totals = shown.map((quote) => (quote.totalMinor == null ? null : BigInt(quote.totalMinor)));
  const lowest = totals.reduce<bigint | null>(
    (min, value) => (value != null && (min == null || value < min) ? value : min),
    null,
  );
  const itemNames = [...new Set(shown.flatMap((quote) => quote.items.map((item) => item.name)))];

  return (
    <section
      aria-labelledby="compare-heading"
      className="border-border/70 bg-surface overflow-hidden rounded-3xl border shadow-[var(--shadow-1)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div>
          <h2 id="compare-heading" className="font-display text-lg font-bold tracking-tight">
            {t('heading')}
          </h2>
          <p className="text-muted text-sm">{t('body')}</p>
        </div>
        <div className="bg-surface-2 inline-flex rounded-full p-1 text-sm" role="group" aria-label={t('filter')}>
          {([false, true] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={onlyPinned === value}
              disabled={value && pins.length === 0}
              onClick={() => setOnlyPinned(value)}
              className={cn(
                'rounded-full px-3.5 py-1.5 font-medium transition disabled:opacity-40',
                onlyPinned === value ? 'bg-surface shadow-[var(--shadow-1)]' : 'text-muted hover:text-[var(--text)]',
              )}
            >
              {value ? t('pinned', { count: pins.length }) : t('all', { count: live.length })}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="bg-surface sticky left-0 w-40 px-5 py-3 text-left">
                <span className="sr-only">{t('row')}</span>
              </th>
              {shown.map((quote, index) => {
                const best = lowest != null && totals[index] === lowest;
                const pinned = pins.includes(quote.id);
                return (
                  <th key={quote.id} scope="col" className="px-3 py-3 text-left align-top">
                    <div
                      className={cn(
                        'flex items-start justify-between gap-2 rounded-2xl border p-3 transition',
                        best ? 'border-success/50 bg-success/5' : 'border-border/70',
                      )}
                    >
                      <div className="min-w-0">
                        {best && (
                          <span className="text-success mb-1 inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase">
                            <Crown aria-hidden className="size-3" />
                            {t('lowest')}
                          </span>
                        )}
                        <p className="truncate font-semibold">{quote.vendorName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(quote.id)}
                        aria-pressed={pinned}
                        aria-label={
                          pinned ? t('unpin', { vendor: quote.vendorName }) : t('pin', { vendor: quote.vendorName })
                        }
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-full transition',
                          pinned ? 'bg-brand text-white' : 'bg-surface-2 text-muted hover:text-[var(--text)]',
                        )}
                      >
                        {pinned ? <PinOff aria-hidden className="size-4" /> : <Pin aria-hidden className="size-4" />}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-border/60 divide-y">
            <Row label={t('total')}>
              {shown.map((quote, index) => (
                <td key={quote.id} className="px-3 py-3">
                  {quote.totalMinor != null ? (
                    <MoneyText
                      value={BigInt(quote.totalMinor)}
                      currency={quote.currency}
                      className={cn('font-display text-lg font-bold', totals[index] === lowest && 'text-success')}
                    />
                  ) : (
                    <span className="text-muted">{t('hidden')}</span>
                  )}
                </td>
              ))}
            </Row>
            <Row label={t('deposit')}>
              {shown.map((quote) => {
                const deposit = depositMinor(quote);
                return (
                  <td key={quote.id} className="px-3 py-3">
                    {deposit != null ? <MoneyText value={deposit} currency={quote.currency} /> : '—'}
                  </td>
                );
              })}
            </Row>
            <Row label={t('payments')}>
              {shown.map((quote) => (
                <td key={quote.id} className="px-3 py-3">
                  {t('instalments', { count: quote.schedule.length })}
                </td>
              ))}
            </Row>
            {itemNames.map((name) => (
              <Row key={name} label={name} muted>
                {shown.map((quote) => {
                  const item = quote.items.find((row) => row.name === name);
                  return (
                    <td key={quote.id} className="px-3 py-2.5">
                      {item ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="bg-success size-1.5 rounded-full" aria-hidden />
                          {item.qty > 1 ? `× ${item.qty}` : t('included')}
                        </span>
                      ) : (
                        <span className="text-muted/60">{t('notIncluded')}</span>
                      )}
                    </td>
                  );
                })}
              </Row>
            ))}
            <Row label={t('cancellation')}>
              {shown.map((quote) => (
                <td key={quote.id} className="text-muted px-3 py-3 text-xs leading-relaxed">
                  <span className="line-clamp-3">{quote.cancellationTerms || '—'}</span>
                </td>
              ))}
            </Row>
            <Row label={t('expires')}>
              {shown.map((quote) => (
                <td key={quote.id} className="px-3 py-3">
                  <DateText value={quote.expiresAt} format="date" />
                </td>
              ))}
            </Row>
          </tbody>
        </table>
      </div>
      <p className="text-muted px-5 py-4 text-xs">{t('footnote')}</p>
    </section>
  );
}

function Row({ label, muted, children }: { label: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <tr className="hover:bg-surface-2/40 transition">
      <th
        scope="row"
        className={cn(
          'bg-surface sticky left-0 px-5 py-3 text-left font-medium',
          muted ? 'text-muted text-xs font-normal' : 'text-sm',
        )}
      >
        {label}
      </th>
      {children}
    </tr>
  );
}
