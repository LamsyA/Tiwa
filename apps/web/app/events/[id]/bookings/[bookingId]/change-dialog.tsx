'use client';

import type { ChangeSummary as Summary } from '@tiwa/core';
import { Banner, Button, Input, MoneyInput, MoneyText, ResponsiveDialog, Textarea } from '@tiwa/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { ChangeSummary } from '@/components/bookings/change-summary.js';
import { requestChangeAction, respondChangeAction } from '../actions.js';

interface ScopeItem {
  name: string;
  qty: number;
  unitMinor: string;
}

function totalsOf(items: ScopeItem[]) {
  return items.reduce((sum, item) => sum + BigInt(item.qty || 0) * BigInt(item.unitMinor || '0'), 0n);
}

function errorKey(code: string) {
  return ['VALIDATION', 'CONFLICT', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_TRANSITION'].includes(code) ? code : 'generic';
}

/**
 * Ask for a change (UF-19). Either side can: the host to add or drop items or
 * move the date, the vendor to charge for extra work ("Add an extra charge").
 * The other side sees exactly what moved and decides.
 */
export function ChangeRequestDialog({
  bookingId,
  currency,
  current,
  slot,
  side,
}: {
  bookingId: string;
  currency: string;
  current: { items: ScopeItem[]; notes: string | null; serviceDate: string | null };
  slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY' | null;
  side: 'host' | 'vendor';
}) {
  const t = useTranslations('bookings');
  const tc = useTranslations('bookings.change');
  const te = useTranslations('bookings.errors');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<ScopeItem[]>(current.items);
  const [notes, setNotes] = React.useState(current.notes ?? '');
  const [serviceDate, setServiceDate] = React.useState(current.serviceDate ?? '');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  const before = totalsOf(current.items);
  const after = totalsOf(items);
  const diff = after - before;
  const valid = items.length > 0 && items.every((item) => item.name.trim() && item.qty > 0);

  function reset() {
    setItems(current.items);
    setNotes(current.notes ?? '');
    setServiceDate(current.serviceDate ?? '');
    setReason('');
    setError(null);
  }

  function update(i: number, patch: Partial<ScopeItem>) {
    setItems((rows) => rows.map((row, at) => (at === i ? { ...row, ...patch } : row)));
  }

  async function onSend() {
    setError(null);
    setWorking(true);
    const result = await requestChangeAction({
      bookingId,
      scope: {
        items: items.map((item) => ({ ...item, name: item.name.trim(), unitMinor: item.unitMinor || '0' })),
        notes: notes.trim() || null,
        serviceDate: serviceDate || null,
        slot,
        spaceId: null,
      },
      reason: reason.trim(),
    });
    setWorking(false);
    if (!result.ok) setError(te(errorKey(result.code) as 'VALIDATION'));
    else {
      setOpen(false);
      reset();
      router.refresh();
    }
  }

  const title = side === 'vendor' ? tc('vendorTitle') : tc('hostTitle');
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {title}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
        title={title}
      >
        <div className="flex flex-col gap-4 p-4 text-sm">
          <p className="text-muted">{side === 'vendor' ? tc('vendorIntro') : tc('hostIntro')}</p>
          {error && <Banner tone="danger">{error}</Banner>}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{tc('itemsHeading')}</legend>
            {items.map((item, i) => (
              <div
                key={i}
                className="border-border/70 grid grid-cols-[1fr_auto] gap-2 rounded-2xl border p-2.5 sm:grid-cols-[1fr_5rem_9rem_auto]"
              >
                <Input
                  aria-label={tc('itemName', { n: i + 1 })}
                  placeholder={tc('itemPlaceholder')}
                  className="col-span-2 sm:col-span-1"
                  value={item.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                <Input
                  aria-label={tc('itemQty', { n: i + 1 })}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={String(item.qty)}
                  onChange={(e) => update(i, { qty: Number(e.target.value) || 0 })}
                />
                <MoneyInput
                  aria-label={tc('itemPrice', { n: i + 1 })}
                  currency={currency}
                  value={item.unitMinor}
                  onValueChange={(value) => update(i, { unitMinor: value })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={tc('removeItem', { name: item.name || i + 1 })}
                  disabled={items.length === 1}
                  onClick={() => setItems((rows) => rows.filter((_, at) => at !== i))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setItems((rows) => [...rows, { name: '', qty: 1, unitMinor: '' }])}
            >
              <Plus className="size-4" aria-hidden />
              {side === 'vendor' ? tc('addCharge') : tc('addItem')}
            </Button>
          </fieldset>
          <div className="bg-surface-2 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5">
            <span className="text-muted">
              {tc('total')} <MoneyText value={before.toString()} currency={currency} />
              {' → '}
              <span className="text-text font-semibold">
                <MoneyText value={after.toString()} currency={currency} />
              </span>
            </span>
            {diff !== 0n && (
              <span className={diff > 0n ? 'text-warning font-semibold' : 'text-success font-semibold'}>
                {diff > 0n ? '+' : '−'}
                <MoneyText value={(diff < 0n ? -diff : diff).toString()} currency={currency} />
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-medium">{t('serviceDateLabel')}</span>
              <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="font-medium">{t('notesLabel')}</span>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{tc('reasonLabel')}</span>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={side === 'vendor' ? tc('vendorReasonPlaceholder') : tc('hostReasonPlaceholder')}
            />
            <span className="text-muted text-xs">{tc('reasonHint')}</span>
          </label>
          <Button disabled={working || !reason.trim() || !valid} onClick={() => void onSend()}>
            {working ? tc('sending') : t('sendRequest')}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}

/** A change waiting for a decision: what changes, why, and Accept / Decline for the other side. */
export function PendingDecision({
  versionId,
  mine,
  otherName,
  askedBy,
  reason,
  summary,
  currency,
}: {
  versionId: string;
  mine: boolean;
  /** Who decides when it is mine; who asked when it is not. */
  otherName: string;
  askedBy: string;
  reason: string | null;
  summary: Summary | null;
  currency: string;
}) {
  const tc = useTranslations('bookings.change');
  const te = useTranslations('bookings.errors');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState<'accept' | 'decline' | null>(null);

  async function onRespond(accept: boolean) {
    setError(null);
    setWorking(accept ? 'accept' : 'decline');
    const result = await respondChangeAction({ versionId, accept });
    setWorking(null);
    if (!result.ok) setError(te(errorKey(result.code) as 'VALIDATION'));
    else router.refresh();
  }

  return (
    <section
      aria-labelledby={`change-${versionId}`}
      className={
        mine
          ? 'border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-4 sm:p-5'
          : 'border-warning/60 bg-warning/5 flex flex-col gap-3 rounded-3xl border p-4 sm:p-5'
      }
    >
      <div>
        <h3 id={`change-${versionId}`} className="font-display text-lg font-semibold">
          {mine ? tc('waitingTitle') : tc('incomingTitle', { name: askedBy })}
        </h3>
        <p className="text-muted text-sm">{mine ? tc('waitingBody', { name: otherName }) : tc('incomingBody')}</p>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {summary && <ChangeSummary summary={summary} currency={currency} reason={reason} askedBy={askedBy} />}
      {!mine && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={working !== null} onClick={() => void onRespond(true)}>
            {working === 'accept' ? tc('working') : tc('accept')}
          </Button>
          <Button variant="secondary" disabled={working !== null} onClick={() => void onRespond(false)}>
            {working === 'decline' ? tc('working') : tc('decline')}
          </Button>
        </div>
      )}
    </section>
  );
}
