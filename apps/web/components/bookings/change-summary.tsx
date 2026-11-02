'use client';

import type { ChangeSummary as Summary } from '@tiwa/core';
import { MoneyText, StatusPill, cn } from '@tiwa/ui';
import { useTranslations } from 'next-intl';

const KIND_TONE = { added: 'success', removed: 'danger', changed: 'warning', same: 'neutral' } as const;

function lineTotal(line: { qty: number; unitMinor: string }) {
  return (BigInt(line.qty) * BigInt(line.unitMinor)).toString();
}

function Signed({ minor, currency }: { minor: string; currency: string }) {
  const value = BigInt(minor);
  return (
    <span className={cn('font-semibold', value > 0n ? 'text-warning' : value < 0n ? 'text-success' : 'text-muted')}>
      {value > 0n ? '+' : value < 0n ? '−' : ''}
      <MoneyText value={(value < 0n ? -value : value).toString()} currency={currency} />
    </span>
  );
}

/**
 * What a change request changes (UF-19): each item marked added, removed or
 * "2 → 3", any date or note move, and the old → new total. Shown to whoever
 * has to decide, so they never approve a bare version number.
 */
export function ChangeSummary({
  summary,
  currency,
  reason,
  askedBy,
}: {
  summary: Summary;
  currency: string;
  reason?: string | null;
  askedBy?: string;
}) {
  const t = useTranslations('bookings.change');
  const changed = summary.lines.filter((line) => line.kind !== 'same');
  const same = summary.lines.length - changed.length;
  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
      : t('noDate');

  return (
    <div className="flex flex-col gap-3 text-sm">
      {reason && (
        <blockquote className="border-brand bg-brand/5 rounded-r-xl border-l-4 px-3 py-2">
          {askedBy && <p className="text-muted text-xs font-medium">{t('askedBy', { name: askedBy })}</p>}
          <p className="mt-0.5 whitespace-pre-line">“{reason}”</p>
        </blockquote>
      )}
      {changed.length > 0 && (
        <ul className="divide-border/60 border-border/70 flex flex-col divide-y rounded-2xl border">
          {changed.map((line, i) => (
            <li key={`${line.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <StatusPill tone={KIND_TONE[line.kind]}>{t(`kind.${line.kind}`)}</StatusPill>
              <span className={cn('min-w-0 flex-1 font-medium', line.kind === 'removed' && 'text-muted line-through')}>
                {line.name}
              </span>
              <span className="text-muted text-xs">
                {line.before && line.after ? (
                  <>
                    {line.before.qty} × <MoneyText value={line.before.unitMinor} currency={currency} />
                    {' → '}
                    <span className="text-text font-medium">
                      {line.after.qty} × <MoneyText value={line.after.unitMinor} currency={currency} />
                    </span>
                  </>
                ) : line.after ? (
                  <>
                    {line.after.qty} × <MoneyText value={line.after.unitMinor} currency={currency} /> ={' '}
                    <MoneyText value={lineTotal(line.after)} currency={currency} />
                  </>
                ) : (
                  line.before && <MoneyText value={lineTotal(line.before)} currency={currency} />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {same > 0 && <p className="text-muted text-xs">{t('unchanged', { count: same })}</p>}
      {(summary.date || summary.slot || summary.notes) && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {summary.date && (
            <div className="bg-surface-2 rounded-xl px-3 py-2">
              <dt className="text-muted text-xs">{t('date')}</dt>
              <dd className="font-medium">
                {formatDate(summary.date.before)} → {formatDate(summary.date.after)}
              </dd>
            </div>
          )}
          {summary.slot && (
            <div className="bg-surface-2 rounded-xl px-3 py-2">
              <dt className="text-muted text-xs">{t('slot')}</dt>
              <dd className="font-medium">
                {summary.slot.before ?? '—'} → {summary.slot.after ?? '—'}
              </dd>
            </div>
          )}
          {summary.notes && (
            <div className="bg-surface-2 rounded-xl px-3 py-2 sm:col-span-2">
              <dt className="text-muted text-xs">{t('notes')}</dt>
              <dd className="whitespace-pre-line">{summary.notes.after ?? t('notesRemoved')}</dd>
            </div>
          )}
        </dl>
      )}
      <div className="bg-surface-2 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5">
        <span className="text-muted">
          {t('total')} <MoneyText value={summary.beforeMinor} currency={currency} />
          {' → '}
          <span className="text-text font-semibold">
            <MoneyText value={summary.afterMinor} currency={currency} />
          </span>
        </span>
        <Signed minor={summary.diffMinor} currency={currency} />
      </div>
    </div>
  );
}
