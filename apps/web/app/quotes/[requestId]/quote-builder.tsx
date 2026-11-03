'use client';

import { Banner, Button, Card, Input, MoneyInput, MoneyText, StatusPill, Textarea } from '@tiwa/ui';
import { Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { totalsOf } from '@/components/marketplace/quote-totals.js';
import { createQuoteAction, sendQuoteAction, withdrawQuoteAction } from '../actions.js';

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

const DUE_OPTIONS = ['on_accept', 'days_before:7', 'days_before:1'] as const;

export function QuoteBuilder({
  requestId,
  eventId,
  vendorOrgId,
  currency,
  existing,
  packages = [],
}: {
  requestId: string;
  eventId: string;
  vendorOrgId: string;
  currency: string;
  existing: DraftQuote[];
  packages?: PackageOption[];
}) {
  const t = useTranslations('quotes');
  const te = useTranslations('quotes.errors');
  const router = useRouter();
  const [items, setItems] = React.useState([{ name: '', qty: 1, unitMinor: '0' }]);
  const [taxBps, setTaxBps] = React.useState(0);
  const [serviceBps, setServiceBps] = React.useState(0);
  const [travelFeeMinor, setTravelFeeMinor] = React.useState('0');
  const [terms, setTerms] = React.useState('');
  const [schedule, setSchedule] = React.useState([{ label: 'Deposit', percentBps: 5000, due: 'on_accept' }]);
  const [expiresAt, setExpiresAt] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const totals = totalsOf(items, taxBps, serviceBps, travelFeeMinor);
  const [picked, setPicked] = React.useState<string | null>(null);

  /** Start from a saved package (D-X46): its price becomes the first line, and
   * what it includes becomes zero-priced lines the host can see itemised. */
  function applyPackage(pack: PackageOption) {
    setPicked(pack.id);
    setItems([
      { name: pack.name, qty: 1, unitMinor: pack.priceMinor ?? '0' },
      ...pack.includes.map((name) => ({ name, qty: 1, unitMinor: '0' })),
    ]);
    if (!terms && pack.description) setTerms(pack.description);
  }

  async function onSave(send: boolean) {
    setError(null);
    setSaving(true);
    try {
      const created = await createQuoteAction({
        requestId,
        eventId,
        vendorOrgId,
        items: items.map((item) => ({ name: item.name, qty: item.qty, unitMinor: item.unitMinor })),
        taxBps,
        serviceBps,
        travelFeeMinor,
        notes: undefined,
        cancellationTerms: terms,
        proposedSchedule: schedule,
        expiresAt: new Date(expiresAt).toISOString(),
      });
      if (!created.ok) {
        setError(te(created.code as 'VALIDATION'));
        return;
      }
      if (send) {
        const sent = await sendQuoteAction({ quoteId: created.data.quoteId });
        if (!sent.ok) setError(te(sent.code as 'VALIDATION'));
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

  return (
    <div className="flex flex-col gap-4">
      {error && <Banner tone="danger">{error}</Banner>}
      {existing.length > 0 && (
        <ul className="flex flex-col gap-2">
          {existing.map((quote) => (
            <li
              key={quote.id}
              className="border-border/70 bg-surface flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm"
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
                <Button variant="secondary" onClick={() => void onSend(quote.id)}>
                  {t('sendQuoteAction')}
                </Button>
              )}
              {['DRAFT', 'SENT', 'CHANGES_REQUESTED'].includes(quote.status) && (
                <Button variant="secondary" onClick={() => void onWithdraw(quote.id)}>
                  {t('withdraw')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {packages.length > 0 && (
        <section aria-labelledby="packages-heading" className="flex flex-col gap-2">
          <h3 id="packages-heading" className="inline-flex items-center gap-2 text-sm font-semibold">
            <Package aria-hidden className="text-brand-strong size-4" />
            {t('fromPackage')}
          </h3>
          <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3">
            {packages.map((pack) => (
              <li key={pack.id} className="w-60 shrink-0 snap-start sm:w-auto">
                <button
                  type="button"
                  aria-pressed={picked === pack.id}
                  onClick={() => applyPackage(pack)}
                  className={`flex h-full w-full flex-col gap-1 rounded-2xl border p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-1)] ${
                    picked === pack.id
                      ? 'border-brand bg-brand-soft/60 ring-brand/30 ring-2'
                      : 'border-border/70 bg-surface'
                  }`}
                >
                  <span className="font-semibold">{pack.name}</span>
                  {pack.priceMinor && (
                    <MoneyText
                      value={pack.priceMinor}
                      currency={currency}
                      className="font-display text-brand-strong text-lg font-bold"
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
      <Card>
        <div className="flex flex-col gap-3 p-4">
          <h3 className="font-display text-base font-bold tracking-tight">{t('itemsHeading')}</h3>
          {items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={t('itemName')}
                value={item.name}
                onChange={(event) => {
                  const next = [...items];
                  next[i] = { ...next[i]!, name: event.target.value };
                  setItems(next);
                }}
                placeholder={t('itemName')}
              />
              <Input
                aria-label={t('qty')}
                type="number"
                min={1}
                value={String(item.qty)}
                onChange={(event) => {
                  const next = [...items];
                  next[i] = { ...next[i]!, qty: Number(event.target.value) || 0 };
                  setItems(next);
                }}
                className="w-20"
              />
              <MoneyInput
                aria-label={t('unitPrice')}
                currency={currency}
                value={item.unitMinor}
                onValueChange={(value) => {
                  const next = [...items];
                  next[i] = { ...next[i]!, unitMinor: value };
                  setItems(next);
                }}
              />
            </div>
          ))}
          <Button variant="secondary" onClick={() => setItems([...items, { name: '', qty: 1, unitMinor: '0' }])}>
            {t('addItem')}
          </Button>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              {t('taxLabel')}
              <Input
                type="number"
                min={0}
                value={String(taxBps)}
                onChange={(e) => setTaxBps(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              {t('serviceLabel')}
              <Input
                type="number"
                min={0}
                value={String(serviceBps)}
                onChange={(e) => setServiceBps(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            {t('travelLabel')}
            <MoneyInput currency={currency} value={travelFeeMinor} onValueChange={setTravelFeeMinor} />
          </label>
          <p className="text-sm font-medium">
            {t('total')}: {totals.total.toString()} {currency}
          </p>
          <label className="flex flex-col gap-1 text-sm">
            {t('termsLabel')}
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder={t('termsPlaceholder')} />
          </label>
          <h3 className="font-display text-base font-bold tracking-tight">{t('scheduleHeading')}</h3>
          {schedule.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={t('itemName')}
                value={entry.label}
                onChange={(e) => {
                  const next = [...schedule];
                  next[i] = { ...next[i]!, label: e.target.value };
                  setSchedule(next);
                }}
              />
              <Input
                aria-label={t('percentLabel')}
                type="number"
                min={1}
                max={10000}
                value={String(entry.percentBps)}
                onChange={(e) => {
                  const next = [...schedule];
                  next[i] = { ...next[i]!, percentBps: Number(e.target.value) || 0 };
                  setSchedule(next);
                }}
                className="w-24"
              />
              <select
                aria-label={t('dueLabel')}
                value={entry.due}
                onChange={(e) => {
                  const next = [...schedule];
                  next[i] = { ...next[i]!, due: e.target.value };
                  setSchedule(next);
                }}
                className="border-border rounded-xl border px-2 text-sm"
              >
                {DUE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => setSchedule([...schedule, { label: '', percentBps: 5000, due: 'on_accept' }])}
          >
            {t('addItem')}
          </Button>
          <label className="flex flex-col gap-1 text-sm">
            {t('expiryLabel')}
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => void onSave(false)}>
              {t('createQuote')}
            </Button>
            <Button disabled={saving} onClick={() => void onSave(true)}>
              {t('sendQuoteAction')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
