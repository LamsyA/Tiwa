'use client';

import { Banner, Button, Input, MoneyInput, MoneyText, cn } from '@tiwa/ui';
import { BadgePercent, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { savePlannerFee } from './actions.js';

/** Planning fee agreement (D-X47): % of budget and/or a fixed fee. The host
 * sees it; only the event's planner edits it. */
export function PlannerFeeCard({
  eventId,
  currency,
  budgetMinor,
  feeBps,
  feeMinor,
  note,
  totalMinor,
  canEdit,
}: {
  eventId: string;
  currency: string;
  budgetMinor: string;
  feeBps: number | null;
  feeMinor: string | null;
  note: string | null;
  totalMinor: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('events.money.plannerFee');
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [percent, setPercent] = React.useState(feeBps != null ? String(feeBps / 100) : '');
  const [fixed, setFixed] = React.useState(feeMinor ?? '0');
  const [terms, setTerms] = React.useState(note ?? '');
  const [error, setError] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const bps = percent.trim() === '' ? null : Math.round(Number(percent) * 100);
  const fixedMinor = fixed && fixed !== '0' ? fixed : null;
  const preview = (fixedMinor ? BigInt(fixedMinor) : 0n) + (bps ? (BigInt(budgetMinor) * BigInt(bps)) / 10_000n : 0n);
  const valid = (bps != null && bps >= 0 && bps <= 10_000) || fixedMinor != null;

  async function onSave() {
    setSaving(true);
    setError(false);
    const result = await savePlannerFee({ eventId, feeBps: bps, feeMinor: fixedMinor, note: terms.trim() || null });
    setSaving(false);
    if (!result.ok) return setError(true);
    setEditing(false);
    router.refresh();
  }

  if (totalMinor == null && !canEdit) return null;

  return (
    <section
      aria-labelledby="planner-fee-heading"
      className="border-border/70 bg-surface rounded-3xl border p-5 shadow-[var(--shadow-1)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="bg-brand-soft text-brand-strong grid size-10 shrink-0 place-items-center rounded-2xl">
            <BadgePercent aria-hidden className="size-5" />
          </span>
          <div>
            <h2 id="planner-fee-heading" className="font-display text-lg font-bold tracking-tight">
              {t('heading')}
            </h2>
            <p className="text-muted text-sm">
              {totalMinor == null
                ? t('empty')
                : [
                    feeBps != null ? t('share', { percent: feeBps / 100 }) : null,
                    feeMinor && feeMinor !== '0' ? t('plusFixed') : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
            </p>
          </div>
        </div>
        {totalMinor != null && !editing && (
          <MoneyText value={totalMinor} currency={currency} className="font-display text-2xl font-bold tabular-nums" />
        )}
      </div>
      {note && !editing && <p className="text-muted mt-3 text-sm whitespace-pre-line">{note}</p>}
      {canEdit && !editing && (
        <Button variant="secondary" size="sm" className="mt-4 rounded-full" onClick={() => setEditing(true)}>
          <Pencil aria-hidden className="size-3.5" />
          {totalMinor == null ? t('set') : t('edit')}
        </Button>
      )}
      {editing && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {error && (
            <Banner tone="danger" className="sm:col-span-2">
              {t('error')}
            </Banner>
          )}
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('percentLabel')}
            <Input
              inputMode="decimal"
              value={percent}
              onChange={(event) => setPercent(event.target.value.replace(/[^\d.]/g, ''))}
              suffix={<span className="text-muted text-sm">%</span>}
              placeholder="10"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm font-medium">
            <span>{t('fixedLabel')}</span>
            <MoneyInput currency={currency} value={fixed} onValueChange={setFixed} aria-label={t('fixedLabel')} />
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
            {t('noteLabel')}
            <Input
              value={terms}
              onChange={(event) => setTerms(event.target.value)}
              placeholder={t('notePlaceholder')}
            />
          </label>
          <div
            className={cn(
              'bg-surface-2/70 flex items-center justify-between rounded-2xl px-4 py-3 text-sm sm:col-span-2',
              !valid && 'opacity-60',
            )}
          >
            <span className="text-muted">{t('preview')}</span>
            <MoneyText value={preview} currency={currency} className="font-display text-lg font-bold" />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button onClick={() => void onSave()} disabled={!valid || saving}>
              {saving ? t('saving') : t('save')}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
