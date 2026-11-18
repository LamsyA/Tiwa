'use client';

import { compressImage } from '@/components/uploads/resize-image.js';

import { Banner, Button, Card, Input, MoneyText, ResponsiveDialog, StatusPill, Textarea } from '@tiwa/ui';
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  Landmark,
  Loader2,
  ShieldCheck,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
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

  const icons = { bank_transfer: Landmark, cash: Banknote, pos: CreditCard, other: Wallet } as const;
  const preview = React.useMemo(
    () => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null),
    [file],
  );
  React.useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const due = milestone.dueAt
    ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(milestone.dueAt),
      )
    : null;

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && !working && onClose()}
      title={t('recordTitle')}
      description={t('recordLead')}
    >
      <div className="flex flex-col gap-5">
        {error && <Banner tone="danger">{error}</Banner>}

        {/* What is being paid (D-X95) */}
        <section className="from-brand-strong relative isolate overflow-hidden rounded-3xl bg-gradient-to-br to-[#2a1210] p-5 text-white shadow-[var(--shadow-2)]">
          <div aria-hidden className="absolute -top-12 -right-8 -z-10 size-40 rounded-full bg-white/10 blur-2xl" />
          <p className="text-xs font-semibold tracking-[0.16em] text-white/70 uppercase">{milestone.label}</p>
          <p className="font-display mt-1 text-3xl font-bold tracking-tight tabular-nums">
            {milestone.amountMinor == null ? (
              <span className="text-base font-medium text-white/80">{t('hiddenByPlanner')}</span>
            ) : (
              <MoneyText value={milestone.amountMinor} currency={milestone.currency} />
            )}
          </p>
          {due && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-white/75">
              <CalendarDays aria-hidden className="size-4" />
              {t('due', { date: due })}
            </p>
          )}
        </section>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{t('methodLabel')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((option) => {
              const Icon = icons[option];
              const on = method === option;
              return (
                <label
                  key={option}
                  className={`relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${
                    on
                      ? 'border-brand bg-brand-soft/50 ring-brand/30 shadow-[var(--shadow-1)] ring-2'
                      : 'border-border/80 bg-surface hover:bg-surface-2'
                  }`}
                >
                  <input
                    type="radio"
                    name="offline-method"
                    className="sr-only"
                    checked={on}
                    onChange={() => setMethod(option)}
                  />
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                      on ? 'bg-brand text-white' : 'bg-surface-2 text-muted'
                    }`}
                  >
                    <Icon aria-hidden className="size-4.5" />
                  </span>
                  <span className="text-sm font-medium">{t(`method.${option}`)}</span>
                  {on && <CheckCircle2 aria-hidden className="text-brand absolute top-2 right-2 size-4" />}
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{t('paidOnLabel')}</span>
          <Input
            type="date"
            value={paidOn}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setPaidOn(e.target.value)}
            className="h-11 rounded-xl"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{t('receiptLabel')}</span>
          {file ? (
            <div className="border-border/80 bg-surface flex items-center gap-3 rounded-2xl border p-3">
              {preview ? (
                <img src={preview} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="bg-surface-2 text-muted grid size-14 shrink-0 place-items-center rounded-xl">
                  <FileText aria-hidden className="size-6" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{file.name}</span>
                <span className="text-muted text-xs">{Math.max(1, Math.round(file.size / 1024))} KB</span>
              </span>
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label={t('removeReceipt')}
                className="text-muted hover:bg-surface-2 hover:text-text grid size-9 place-items-center rounded-xl transition"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          ) : (
            <label className="border-border hover:border-brand/60 hover:bg-brand-soft/20 flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition">
              <span className="bg-brand-soft text-brand-strong grid size-11 place-items-center rounded-2xl">
                <Upload aria-hidden className="size-5" />
              </span>
              <span className="text-sm font-medium">{t('receiptCta')}</span>
              <span className="text-muted text-xs">{t('receiptHint')}</span>
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  // D-X81: receipts as images are compressed to ≤ 800 KB at 95% quality.
                  if (picked) void compressImage(picked).then(setFile);
                  else setFile(null);
                }}
              />
            </label>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{t('noteLabel')}</span>
          <Textarea
            value={note}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('notePlaceholder')}
            className="rounded-xl"
          />
        </label>

        <p className="bg-surface-2/70 text-muted flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm">
          <ShieldCheck aria-hidden className="text-success mt-0.5 size-4 shrink-0" />
          {t('recordBody')}
        </p>

        <Button disabled={working || !paidOn} onClick={() => void onSave()} className="h-12 rounded-2xl text-base">
          {working ? (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {file ? t('uploadingReceipt') : t('recording')}
            </>
          ) : (
            <>
              <CheckCircle2 aria-hidden className="size-4" />
              {t('recordSubmit')}
            </>
          )}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
