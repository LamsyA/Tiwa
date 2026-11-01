'use client';

import { Banner, Button, Card, Input, MoneyText, ResponsiveDialog, StatusPill, Textarea } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { receiptUrlAction, recordOfflineAction, startReceiptAction } from '../actions.js';

const METHODS = ['bank_transfer', 'cash', 'pos', 'other'] as const;
type Method = (typeof METHODS)[number];

export interface MilestoneRow {
  id: string;
  label: string;
  /** Null when the planner hides vendor prices from the host (EVT-12). */
  amountMinor: string | null;
  currency: string;
  state: string;
  dueAt: string | null;
}

export interface PaymentRow {
  id: string;
  milestoneId: string | null;
  status: string;
  paidAt: string | null;
  offlineMethod: string | null;
  hasReceipt: boolean;
}

export interface MoneySummary {
  securedMinor: string | null;
  awaitingMinor: string | null;
  outstandingMinor: string | null;
}

const SECURED = ['PAID_DIRECT', 'HELD', 'RELEASED', 'CONFIRMED_OFFLINE'];

function tone(state: string): 'success' | 'brand' | 'neutral' {
  if (SECURED.includes(state)) return 'success';
  if (state === 'RECORDED_OFFLINE') return 'brand';
  return 'neutral';
}

/** Booking payments tab (P8-T08/T16, D-X27): status totals, schedule, "I paid outside Tiwa". */
export function PaymentsPanel({
  currency,
  canRecord,
  money,
  milestones,
  payments,
}: {
  currency: string;
  canRecord: boolean;
  money: MoneySummary;
  milestones: MilestoneRow[];
  payments: PaymentRow[];
}) {
  const t = useTranslations('payments');
  const [recording, setRecording] = React.useState<MilestoneRow | null>(null);

  async function openReceipt(paymentId: string) {
    const result = await receiptUrlAction({ paymentId });
    if (result.ok) window.open(result.data.url, '_blank', 'noopener');
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(
          [
            ['secured', money.securedMinor],
            ['awaiting', money.awaitingMinor],
            ['outstanding', money.outstandingMinor],
          ] as const
        ).map(([key, value]) => (
          <Card key={key}>
            <div className="flex flex-col gap-0.5 p-3 text-sm">
              <span className="text-muted">{t(key)}</span>
              <span className="text-base font-medium">
                {value == null ? (
                  <span className="text-muted text-sm">{t('hiddenByPlanner')}</span>
                ) : (
                  <MoneyText value={value} currency={currency} />
                )}
              </span>
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <ul className="divide-border flex flex-col divide-y text-sm">
          {milestones.map((row) => {
            const payment = payments.find((item) => item.milestoneId === row.id && item.status !== 'FAILED');
            return (
              <li key={row.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="font-medium">{row.label}</span>
                  <span className="text-muted">
                    {row.amountMinor == null ? (
                      t('hiddenByPlanner')
                    ) : (
                      <MoneyText value={row.amountMinor} currency={row.currency} />
                    )}
                    {row.dueAt && ` · ${t('due', { date: new Date(row.dueAt).toLocaleDateString() })}`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={tone(row.state)}>
                    {t.has(`state.${row.state}`) ? t(`state.${row.state}`) : row.state}
                  </StatusPill>
                  {payment?.hasReceipt && (
                    <Button variant="ghost" size="sm" onClick={() => void openReceipt(payment.id)}>
                      {t('viewReceipt')}
                    </Button>
                  )}
                  {canRecord && (row.state === 'SCHEDULED' || row.state === 'PENDING_PAYMENT') && (
                    <Button variant="secondary" size="sm" onClick={() => setRecording(row)}>
                      {t('paidOutside')}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="text-muted text-xs">{t('offlineNote')}</p>
      {recording && <RecordDialog milestone={recording} onClose={() => setRecording(null)} />}
    </div>
  );
}

function RecordDialog({ milestone, onClose }: { milestone: MilestoneRow; onClose: () => void }) {
  const t = useTranslations('payments');
  const router = useRouter();
  const [paidOn, setPaidOn] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = React.useState<Method>('bank_transfer');
  const [note, setNote] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  function message(result: { code: string; fieldErrors?: Record<string, string[] | undefined> }) {
    const key = Object.values(result.fieldErrors ?? {}).flat()[0];
    if (key && t.has(`errors.${key}`)) return t(`errors.${key}`);
    return t.has(`errors.${result.code}`) ? t(`errors.${result.code}`) : t('errors.generic');
  }

  async function onSave() {
    setError(null);
    if (milestone.amountMinor == null) {
      setError(t('hiddenByPlanner'));
      return;
    }
    setWorking(true);
    let receiptKey: string | undefined;
    if (file) {
      const mime = file.type || 'application/octet-stream';
      const started = await startReceiptAction({ milestoneId: milestone.id, mime, sizeBytes: file.size });
      if (!started.ok) {
        setWorking(false);
        setError(message(started));
        return;
      }
      const put = await fetch(started.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': mime },
      }).catch(() => null);
      if (!put?.ok) {
        setWorking(false);
        setError(t('errors.uploadFailed'));
        return;
      }
      receiptKey = started.data.receiptKey;
    }
    const result = await recordOfflineAction({
      milestoneId: milestone.id,
      amountMinor: milestone.amountMinor,
      paidOn,
      method,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(receiptKey ? { receiptKey } : {}),
    });
    setWorking(false);
    if (!result.ok) {
      setError(message(result));
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()} title={t('recordTitle')}>
      <div className="flex flex-col gap-3 p-4 text-sm">
        {error && <Banner tone="danger">{error}</Banner>}
        <p>
          {milestone.label} ·{' '}
          {milestone.amountMinor == null ? (
            t('hiddenByPlanner')
          ) : (
            <MoneyText value={milestone.amountMinor} currency={milestone.currency} />
          )}
        </p>
        <label className="flex flex-col gap-1">
          {t('paidOnLabel')}
          <Input
            type="date"
            value={paidOn}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">{t('methodLabel')}</legend>
          {METHODS.map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input
                type="radio"
                name="offline-method"
                checked={method === option}
                onChange={() => setMethod(option)}
              />
              {t(`method.${option}`)}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1">
          {t('receiptLabel')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="flex flex-col gap-1">
          {t('noteLabel')}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
        </label>
        <p className="text-muted">{t('recordBody')}</p>
        <Button disabled={working || !paidOn} onClick={() => void onSave()}>
          {t('recordSubmit')}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
