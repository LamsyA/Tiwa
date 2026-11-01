'use client';

import { Banner, Button, Input, MoneyInput, MoneyText, ResponsiveDialog, Textarea } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
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

export function ChangeRequestDialog({
  bookingId,
  currency,
  current,
  slot,
}: {
  bookingId: string;
  currency: string;
  current: { items: ScopeItem[]; notes: string | null; serviceDate: string | null };
  slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY' | null;
}) {
  const t = useTranslations('bookings');
  const te = useTranslations('bookings.errors');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<ScopeItem[]>(current.items);
  const [notes, setNotes] = React.useState(current.notes ?? '');
  const [serviceDate, setServiceDate] = React.useState(current.serviceDate ?? '');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  async function onSend() {
    setError(null);
    setWorking(true);
    const result = await requestChangeAction({
      bookingId,
      scope: {
        items,
        notes: notes || null,
        serviceDate: serviceDate || null,
        slot,
        spaceId: null,
      },
      reason,
    });
    setWorking(false);
    if (!result.ok) setError(te(errorKey(result.code) as 'VALIDATION'));
    else {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('requestChange')}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t('requestChange')}>
        <div className="flex flex-col gap-3 p-4 text-sm">
          {error && <Banner tone="danger">{error}</Banner>}
          {items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={`item-${i}`}
                value={item.name}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i]!, name: e.target.value };
                  setItems(next);
                }}
              />
              <Input
                aria-label={`qty-${i}`}
                type="number"
                min={1}
                className="w-20"
                value={String(item.qty)}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i]!, qty: Number(e.target.value) || 0 };
                  setItems(next);
                }}
              />
              <MoneyInput
                aria-label={`price-${i}`}
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
          <p>
            {t('totalLabel')}: <MoneyText value={totalsOf(items)} currency={currency} />
          </p>
          <label className="flex flex-col gap-1">
            {t('notesLabel')}
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            {t('changeReasonLabel')}
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('changeReasonPlaceholder')}
            />
          </label>
          <label className="flex flex-col gap-1">
            {t('serviceDateLabel')}
            <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
          </label>
          <Button disabled={working || !reason.trim() || items.length === 0} onClick={() => void onSend()}>
            {t('sendRequest')}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}

export function PendingDecision({
  versionId,
  mine,
  vendorName,
  version,
}: {
  versionId: string;
  mine: boolean;
  vendorName: string;
  version: number;
}) {
  const t = useTranslations('bookings');
  const te = useTranslations('bookings.errors');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  async function onRespond(accept: boolean) {
    setError(null);
    setWorking(true);
    const result = await respondChangeAction({ versionId, accept });
    setWorking(false);
    if (!result.ok) setError(te(errorKey(result.code) as 'VALIDATION'));
    else router.refresh();
  }

  if (mine) {
    return (
      <div className="border-border rounded-lg border p-3 text-sm">
        <p className="font-medium">{t('pendingTitle')}</p>
        <p className="text-muted">{t('waitingBody', { version })}</p>
      </div>
    );
  }

  return (
    <div className="border-warning rounded-lg border p-3 text-sm">
      {error && <Banner tone="danger">{error}</Banner>}
      <p className="font-medium">{t('pendingTitle')}</p>
      <p className="text-muted">{t('pendingBody', { side: vendorName, version })}</p>
      <div className="mt-2 flex gap-2">
        <Button disabled={working} onClick={() => void onRespond(true)}>
          {t('acceptChange')}
        </Button>
        <Button variant="secondary" disabled={working} onClick={() => void onRespond(false)}>
          {t('declineChange')}
        </Button>
      </div>
    </div>
  );
}
