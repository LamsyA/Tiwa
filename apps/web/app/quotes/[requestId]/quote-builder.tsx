'use client';

import { Banner, Button, Input, MoneyInput, MoneyText, StatusPill, Textarea, cn } from '@tiwa/ui';
import { CalendarClock, Package, Plus, Send, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { totalsOf } from '@/components/marketplace/quote-totals.js';
import { createQuoteAction, sendQuoteAction, updateQuoteAction, withdrawQuoteAction } from '../actions.js';

// Quote / proposal builder (QTE-02; D-X65 redesign). Form on the left, a live
// summary on the right: total, the host's budget beside it, and the payment
// plan in real amounts. People type percentages and pick due dates in words;
// basis points and due codes stay internal.

export interface PackageOption {
  id: string;
  name: string;
  description: string | null;
  priceMinor: string | null;
  includes: string[];
}

interface DraftQuote {
  id: string;
  status: string;
  totalMinor: string;
  currency: string;
  expiresAt: string | Date;
}

/** A quote the client sent back for changes, loaded into the form (D-X66). */
export interface RevisableQuote {
  id: string;
  items: { name: string; qty: number; unitMinor: string }[];
  taxBps: number;
  serviceBps: number;
  travelFeeMinor: string;
  notes: string | null;
  cancellationTerms: string;
  schedule: { label: string; percentBps?: number; due: string }[];
  expiresAt: string;
}

interface Line {
  name: string;
  qty: number;
  unitMinor: string;
}
interface Instalment {
  label: string;
  percent: string;
  due: string;
}

const DUE_OPTIONS = ['on_accept', 'days_before:30', 'days_before:14', 'days_before:7', 'days_before:1'] as const;

/** "7.5" → 750 basis points; anything unparsable → 0. */
function toBps(percent: string): number {
  const value = Number(percent);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

function defaultExpiry(): string {
  return new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
}

export function QuoteBuilder({
  requestId,
  eventId,
  vendorOrgId,
  currency,
  existing,
  packages = [],
  proposal = false,
  budgetMinor = null,
  revise = null,
}: {
  requestId: string;
  eventId: string;
  vendorOrgId: string;
  currency: string;
  existing: DraftQuote[];
  packages?: PackageOption[];
  /** D-X64: a planner answering a planning request writes a proposal. */
  proposal?: boolean;
  /** The client's budget from the brief, in minor units. */
  budgetMinor?: string | null;
  /** D-X66: revise this quote in place instead of creating a new one. */
  revise?: RevisableQuote | null;
}) {
  const tq = useTranslations('quotes');
  const tb = useTranslations('proposals.builder');
  // Proposal wording where it exists, quote wording otherwise.
  const t = Object.assign(
    (key: string, values?: Record<string, string | number>): string =>
      proposal && tb.has(key as never)
        ? (tb as unknown as (k: string, v?: typeof values) => string)(key, values)
        : (tq as unknown as (k: string, v?: typeof values) => string)(key, values),
    { has: (key: string) => tq.has(key as never) },
  );
  const te = useTranslations('quotes.errors');
  const router = useRouter();
  const [items, setItems] = React.useState<Line[]>(
    revise?.items.length ? revise.items : [{ name: '', qty: 1, unitMinor: '0' }],
  );
  const [taxPercent, setTaxPercent] = React.useState(String((revise?.taxBps ?? 0) / 100));
  const [servicePercent, setServicePercent] = React.useState(String((revise?.serviceBps ?? 0) / 100));
  const [travelFeeMinor, setTravelFeeMinor] = React.useState(revise?.travelFeeMinor ?? '0');
  const [notes, setNotes] = React.useState(revise?.notes ?? '');
  const [terms, setTerms] = React.useState(revise?.cancellationTerms ?? '');
  const [schedule, setSchedule] = React.useState<Instalment[]>(
    revise?.schedule.length
      ? revise.schedule.map((entry) => ({
          label: entry.label,
          percent: entry.percentBps !== undefined ? String(entry.percentBps / 100) : '',
          due: entry.due,
        }))
      : [
          { label: tq('builder.depositLabel'), percent: '50', due: 'on_accept' },
          { label: tq('builder.balanceLabel'), percent: '50', due: 'days_before:7' },
        ],
  );
  const [expiresAt, setExpiresAt] = React.useState(() => {
    const kept = revise?.expiresAt.slice(0, 10);
    return kept && kept > new Date().toISOString().slice(0, 10) ? kept : defaultExpiry();
  });
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [picked, setPicked] = React.useState<string | null>(null);

  const taxBps = toBps(taxPercent);
  const serviceBps = toBps(servicePercent);
  const totals = totalsOf(items, taxBps, serviceBps, travelFeeMinor);
  const taxMinor = (totals.subtotal * BigInt(taxBps)) / 10_000n;
  const serviceMinor = (totals.subtotal * BigInt(serviceBps)) / 10_000n;
  const planBps = schedule.reduce((sum, entry) => sum + toBps(entry.percent), 0);
  const budget = budgetMinor && budgetMinor !== '0' ? BigInt(budgetMinor) : null;
  const budgetGap = budget !== null && totals.total > 0n ? totals.total - budget : null;
  const canSave = totals.total > 0n && items.every((item) => item.name.trim()) && planBps > 0 && planBps <= 10_000;

  const dueText = (due: string): string => {
    if (due === 'on_accept') return tq('builder.due.onAccept');
    const days = /^days_before:(\d+)$/.exec(due)?.[1];
    return days ? tq('builder.due.daysBefore', { days: Number(days) }) : due;
  };

  /** Start from a saved package (D-X46): its price becomes the first line, and
   * what it includes becomes zero-priced lines the client can see itemised. */
  function applyPackage(pack: PackageOption) {
    setPicked(pack.id);
    setItems([
      { name: pack.name, qty: 1, unitMinor: pack.priceMinor ?? '0' },
      ...pack.includes.map((name) => ({ name, qty: 1, unitMinor: '0' })),
    ]);
    if (!terms && pack.description) setTerms(pack.description);
  }

  const updateItem = (index: number, patch: Partial<Line>) =>
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const updateEntry = (index: number, patch: Partial<Instalment>) =>
    setSchedule((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  async function onSave(send: boolean) {
    setError(null);
    setSaving(true);
    try {
      const body = {
        items: items.map((item) => ({ name: item.name.trim(), qty: item.qty, unitMinor: item.unitMinor })),
        taxBps,
        serviceBps,
        travelFeeMinor,
        notes: notes.trim() || undefined,
        cancellationTerms: terms,
        proposedSchedule: schedule
          .filter((entry) => toBps(entry.percent) > 0)
          .map((entry) => ({
            label: entry.label.trim() || tq('builder.paymentLabel'),
            percentBps: toBps(entry.percent),
            due: entry.due,
          })),
        expiresAt: new Date(`${expiresAt}T23:59:00`).toISOString(),
      };
      // D-X66: a sent-back quote is updated in place, then re-sent as a new revision.
      let quoteId: string;
      if (revise) {
        const updated = await updateQuoteAction({ quoteId: revise.id, ...body });
        if (!updated.ok) {
          setError(te(updated.code as 'VALIDATION'));
          return;
        }
        quoteId = revise.id;
      } else {
        const created = await createQuoteAction({ requestId, eventId, vendorOrgId, ...body });
        if (!created.ok) {
          setError(te(created.code as 'VALIDATION'));
          return;
        }
        quoteId = created.data.quoteId;
      }
      if (send) {
        const sent = await sendQuoteAction({ quoteId });
        if (!sent.ok) {
          setError(te(sent.code as 'VALIDATION'));
          return;
        }
        // D-X67: close the builder and confirm on the inbox with a pop-up.
        router.push(`/quotes?sent=${proposal ? 'proposal' : 'quote'}${revise ? '&revised=1' : ''}`);
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onWithdraw(quoteId: string) {
    const result = await withdrawQuoteAction({ quoteId });
    if (!result.ok) setError(te(result.code as 'VALIDATION'));
    else router.refresh();
  }

  async function onSend(quoteId: string) {
    const result = await sendQuoteAction({ quoteId });
    if (!result.ok) setError(te(result.code as 'VALIDATION'));
    else router.refresh();
  }

  const sectionTitle = 'text-muted text-xs font-semibold tracking-[0.14em] uppercase';

  return (
    <div className="flex flex-col gap-6">
      {error && <Banner tone="danger">{error}</Banner>}

      {existing.length > 0 && (
        <ul className="flex flex-col gap-2">
          {existing.map((quote) => (
            <li
              key={quote.id}
              className="border-border/70 bg-surface flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-[var(--shadow-1)]"
            >
              <StatusPill tone={quote.status === 'SENT' ? 'success' : 'neutral'}>
                {t.has(`quoteStatus.${quote.status}`) ? t(`quoteStatus.${quote.status}`) : quote.status}
              </StatusPill>
              <span className="text-muted flex-1">
                {t('total')}{' '}
                <MoneyText
                  value={quote.totalMinor}
                  currency={quote.currency}
                  className="font-semibold text-[var(--text)]"
                />
              </span>
              {quote.status === 'DRAFT' && (
                <Button variant="secondary" className="rounded-xl" onClick={() => void onSend(quote.id)}>
                  {t('sendQuoteAction')}
                </Button>
              )}
              {['DRAFT', 'SENT', 'CHANGES_REQUESTED'].includes(quote.status) && (
                <Button variant="ghost" className="rounded-xl" onClick={() => void onWithdraw(quote.id)}>
                  {t('withdraw')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {packages.length > 0 && (
        <section aria-labelledby="packages-heading" className="flex flex-col gap-3">
          <h3 id="packages-heading" className="inline-flex items-center gap-2 text-sm font-semibold">
            <Package aria-hidden className="text-brand-strong size-4" />
            {t('fromPackage')}
          </h3>
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:grid-cols-3">
            {packages.map((pack) => (
              <li key={pack.id} className="w-64 shrink-0 snap-start sm:w-auto">
                <button
                  type="button"
                  aria-pressed={picked === pack.id}
                  onClick={() => applyPackage(pack)}
                  className={cn(
                    'flex h-full w-full flex-col gap-1.5 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]',
                    picked === pack.id
                      ? 'border-brand-strong bg-brand-soft/50 ring-brand-strong/15 ring-4'
                      : 'border-border/70 bg-surface',
                  )}
                >
                  <span className="font-semibold">{pack.name}</span>
                  {pack.priceMinor && (
                    <MoneyText
                      value={pack.priceMinor}
                      currency={currency}
                      className="font-display text-brand-strong text-xl font-bold"
                    />
                  )}
                  {pack.includes.length > 0 && (
                    <span className="text-muted line-clamp-2 text-xs">{pack.includes.join(' · ')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Form ── */}
        <div className="border-border/70 bg-surface flex flex-col gap-8 rounded-3xl border p-5 shadow-[var(--shadow-1)] sm:p-7">
          <section className="flex flex-col gap-3">
            <h3 className={sectionTitle}>{t('itemsHeading')}</h3>
            <div className="text-muted hidden grid-cols-[minmax(0,1fr)_76px_160px_36px] gap-2 px-1 text-xs font-medium sm:grid">
              <span>{tq('builder.colService')}</span>
              <span>{tq('qty')}</span>
              <span>{tq('unitPrice')}</span>
              <span />
            </div>
            <ul className="flex flex-col gap-3">
              {items.map((item, i) => (
                <li
                  key={i}
                  className="bg-surface-2/60 grid grid-cols-[1fr_76px] gap-2 rounded-2xl p-2 sm:grid-cols-[minmax(0,1fr)_76px_160px_36px] sm:bg-transparent sm:p-0"
                >
                  <Input
                    aria-label={t('itemName')}
                    value={item.name}
                    onChange={(event) => updateItem(i, { name: event.target.value })}
                    placeholder={t('itemName')}
                    className="col-span-2 sm:col-span-1"
                  />
                  <Input
                    aria-label={tq('qty')}
                    type="number"
                    min={1}
                    value={String(item.qty)}
                    onChange={(event) => updateItem(i, { qty: Number(event.target.value) || 0 })}
                  />
                  <MoneyInput
                    aria-label={tq('unitPrice')}
                    currency={currency}
                    value={item.unitMinor}
                    onValueChange={(value) => updateItem(i, { unitMinor: value })}
                  />
                  <button
                    type="button"
                    aria-label={tq('builder.removeLine')}
                    disabled={items.length === 1}
                    onClick={() => setItems((rows) => rows.filter((_, index) => index !== i))}
                    className="text-muted hover:text-danger hover:bg-danger/10 col-span-2 flex h-11 items-center justify-center rounded-xl transition disabled:opacity-30 sm:col-span-1"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setItems([...items, { name: '', qty: 1, unitMinor: '0' }])}
              className="text-brand-strong hover:bg-brand-soft/50 inline-flex w-fit items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition"
            >
              <Plus aria-hidden className="size-4" />
              {tq('builder.addLine')}
            </button>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className={sectionTitle}>{tq('builder.feesHeading')}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {tq('taxLabel')}
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {tq('serviceLabel')}
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  value={servicePercent}
                  onChange={(e) => setServicePercent(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {tq('travelLabel')}
                <MoneyInput currency={currency} value={travelFeeMinor} onValueChange={setTravelFeeMinor} />
              </label>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className={sectionTitle}>{t('scheduleHeading')}</h3>
              <span className={cn('text-xs font-semibold', planBps === 10_000 ? 'text-success' : 'text-warning')}>
                {tq('builder.planShare', { percent: planBps / 100 })}
              </span>
            </div>
            <ul className="flex flex-col gap-3">
              {schedule.map((entry, i) => (
                <li key={i} className="grid grid-cols-[1fr_96px] gap-2 sm:grid-cols-[minmax(0,1fr)_96px_200px_36px]">
                  <Input
                    aria-label={tq('builder.instalmentName')}
                    value={entry.label}
                    onChange={(e) => updateEntry(i, { label: e.target.value })}
                    className="col-span-2 sm:col-span-1"
                  />
                  <div className="relative">
                    <Input
                      aria-label={tq('percentLabel')}
                      type="number"
                      min={1}
                      max={100}
                      inputMode="decimal"
                      value={entry.percent}
                      onChange={(e) => updateEntry(i, { percent: e.target.value })}
                      className="pr-8"
                    />
                    <span className="text-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
                      %
                    </span>
                  </div>
                  <select
                    aria-label={tq('dueLabel')}
                    value={entry.due}
                    onChange={(e) => updateEntry(i, { due: e.target.value })}
                    className="border-border bg-bg focus:border-brand-strong h-11 rounded-xl border px-3 text-sm outline-none"
                  >
                    {DUE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {dueText(option)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={tq('builder.removeInstalment')}
                    disabled={schedule.length === 1}
                    onClick={() => setSchedule((rows) => rows.filter((_, index) => index !== i))}
                    className="text-muted hover:text-danger hover:bg-danger/10 hidden h-11 items-center justify-center rounded-xl transition disabled:opacity-30 sm:flex"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={schedule.length >= 10}
              onClick={() => setSchedule([...schedule, { label: '', percent: '', due: 'days_before:7' }])}
              className="text-brand-strong hover:bg-brand-soft/50 inline-flex w-fit items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition"
            >
              <Plus aria-hidden className="size-4" />
              {tq('builder.addInstalment')}
            </button>
          </section>

          <section className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {tq('builder.noteLabel')}
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tq('builder.notePlaceholder')}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {tq('termsLabel')}
              <Textarea
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder={tq('termsPlaceholder')}
              />
            </label>
            <label className="flex max-w-xs flex-col gap-1.5 text-sm font-medium">
              {tq('expiryLabel')}
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
          </section>
        </div>

        {/* ── Live summary ── */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-3xl bg-[#1c1917] text-white shadow-[var(--shadow-2)]">
            <div className="flex flex-col gap-1 p-6">
              <p className="text-xs font-semibold tracking-[0.18em] text-white/60 uppercase">
                {tq('builder.summaryTitle')}
              </p>
              <p className="font-display text-4xl font-bold tracking-tight">
                <MoneyText value={totals.total.toString()} currency={currency} />
              </p>
              <p className="text-sm text-white/60">{tq('builder.totalHint')}</p>
            </div>
            <dl className="flex flex-col gap-2 border-t border-white/10 px-6 py-4 text-sm">
              {[
                [tq('builder.subtotal'), totals.subtotal],
                [tq('taxLabel'), taxMinor],
                [tq('serviceLabel'), serviceMinor],
                [tq('travelLabel'), BigInt(travelFeeMinor || '0')],
              ]
                .filter(([, value], index) => index === 0 || (value as bigint) > 0n)
                .map(([label, value]) => (
                  <div key={label as string} className="flex justify-between gap-3 text-white/80">
                    <dt>{label as string}</dt>
                    <dd className="tabular-nums">
                      <MoneyText value={(value as bigint).toString()} currency={currency} />
                    </dd>
                  </div>
                ))}
            </dl>
            {budget !== null && (
              <div className="border-t border-white/10 px-6 py-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-white/80">
                    <Wallet aria-hidden className="size-4" />
                    {tq('builder.clientBudget')}
                  </span>
                  <span className="font-semibold tabular-nums">
                    <MoneyText value={budget.toString()} currency={currency} />
                  </span>
                </div>
                {budgetGap !== null && (
                  <p
                    className={cn(
                      'mt-2 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium',
                      budgetGap > 0n ? 'bg-[#f59e0b]/15 text-[#fcd34d]' : 'bg-[#10b981]/15 text-[#6ee7b7]',
                    )}
                  >
                    {budgetGap > 0n ? (
                      <TrendingUp aria-hidden className="size-3.5" />
                    ) : (
                      <TrendingDown aria-hidden className="size-3.5" />
                    )}
                    {budgetGap > 0n ? tq('builder.overBudget') : tq('builder.withinBudget')}{' '}
                    <MoneyText value={(budgetGap > 0n ? budgetGap : -budgetGap).toString()} currency={currency} />
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-5 shadow-[var(--shadow-1)]">
            <p className={sectionTitle}>{t('scheduleHeading')}</p>
            <ol className="flex flex-col gap-2.5">
              {schedule
                .filter((entry) => toBps(entry.percent) > 0)
                .map((entry, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{entry.label || tq('builder.paymentLabel')}</span>
                      <span className="text-muted flex items-center gap-1 text-xs">
                        <CalendarClock aria-hidden className="size-3" />
                        {dueText(entry.due)} · {Number(entry.percent)}%
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      <MoneyText
                        value={((totals.total * BigInt(toBps(entry.percent))) / 10_000n).toString()}
                        currency={currency}
                      />
                    </span>
                  </li>
                ))}
            </ol>
            {planBps > 10_000 && <p className="text-danger text-xs font-medium">{tq('builder.planOver')}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="rounded-2xl"
              disabled={saving || !canSave}
              loading={saving}
              onClick={() => void onSave(true)}
            >
              <Send aria-hidden className="size-4" />
              {revise
                ? tq('changes.sendRevision', { kind: proposal ? tq('changes.kindProposal') : tq('changes.kindQuote') })
                : t('sendQuoteAction')}
            </Button>
            <Button
              variant="secondary"
              className="rounded-2xl"
              disabled={saving || !canSave}
              onClick={() => void onSave(false)}
            >
              {t('createQuote')}
            </Button>
            {!canSave && <p className="text-muted text-center text-xs">{tq('builder.fillHint')}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
