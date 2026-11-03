'use client';

import type { BudgetSplitLine } from '@tiwa/core';
import { Banner, Button, MoneyText, ResponsiveDialog, Textarea, cn } from '@tiwa/ui';
import { ArrowRight, Check, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { AiNote, AiThinking, AiTrigger, aiErrorKey } from '@/components/ai/ai-ui.js';
import { draftBudgetSplitAction, setAllocationsAction } from './actions.js';

interface Split {
  totalMinor: string;
  currency: string;
  lines: BudgetSplitLine[];
  note: string;
}

/**
 * "Split my budget" (AI-01, P15-T03): the AI proposes how much each budget
 * category gets; the host sees current → proposed per line and taps Apply.
 * Nothing changes until then (AI-06).
 */
export function AiBudgetSplit({ eventId }: { eventId: string }) {
  const t = useTranslations('ai.budget');
  const te = useTranslations('ai.errors');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [request, setRequest] = React.useState('');
  const [split, setSplit] = React.useState<Split | null>(null);
  const [busy, setBusy] = React.useState<'draft' | 'apply' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState(false);

  function fail(result: { code: string; fieldErrors?: Record<string, string[] | undefined> }) {
    const key = aiErrorKey(result);
    setError(te.has(key) ? te(key as 'generic') : te('generic'));
  }

  async function draft() {
    setError(null);
    setBusy('draft');
    const result = await draftBudgetSplitAction({ eventId, request });
    setBusy(null);
    if (!result.ok) return fail(result);
    setSplit(result.data);
  }

  async function apply() {
    if (!split) return;
    setError(null);
    setBusy('apply');
    const result = await setAllocationsAction({
      eventId,
      allocations: split.lines.map((line) => ({ key: line.key, plannedMinor: line.plannedMinor })),
    });
    setBusy(null);
    if (!result.ok) return fail(result);
    setApplied(true);
    router.refresh();
  }

  function reset() {
    setSplit(null);
    setApplied(false);
    setError(null);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      trigger={<AiTrigger onClick={() => setOpen(true)}>{t('trigger')}</AiTrigger>}
      title={t('title')}
      description={t('subtitle')}
      className="md:max-w-xl"
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        {applied ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center" aria-live="polite">
            <span className="bg-success/15 text-success grid size-14 place-items-center rounded-full">
              <Check className="size-7" aria-hidden />
            </span>
            <p className="font-display text-xl font-bold">{t('appliedTitle')}</p>
            <p className="text-muted text-sm">{t('appliedBody')}</p>
            <Button onClick={() => setOpen(false)}>{t('done')}</Button>
          </div>
        ) : !split ? (
          <>
            <Textarea
              aria-label={t('requestLabel')}
              rows={3}
              value={request}
              maxLength={1000}
              disabled={busy !== null}
              placeholder={t('requestPlaceholder')}
              onChange={(e) => setRequest(e.target.value)}
            />
            {busy === 'draft' ? (
              <AiThinking label={t('thinking')} />
            ) : (
              <Button className="self-end rounded-full" onClick={() => void draft()}>
                {t('draft')}
              </Button>
            )}
            <AiNote>
              <p>
                <span className="font-semibold">{t('ruleTitle')}</span> {t('ruleBody')}
              </p>
            </AiNote>
          </>
        ) : (
          <>
            <div className="bg-surface-2 flex items-center justify-between rounded-2xl px-4 py-3 text-sm">
              <span className="text-muted">{t('total')}</span>
              <span className="font-display text-lg font-bold">
                <MoneyText value={split.totalMinor} currency={split.currency} />
              </span>
            </div>
            <ul className="divide-border/60 border-border/70 flex flex-col divide-y rounded-2xl border">
              {split.lines.map((line) => {
                const changed = line.plannedMinor !== line.currentMinor;
                return (
                  <li key={line.key} className="flex flex-col gap-1.5 px-4 py-3">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{line.label}</span>
                      <span className="text-muted hidden text-xs sm:inline">
                        <MoneyText value={line.currentMinor} currency={split.currency} />
                      </span>
                      <ArrowRight className="text-muted hidden size-3.5 sm:block" aria-hidden />
                      <span className={cn('font-semibold tabular-nums', changed && 'text-brand-strong')}>
                        <MoneyText value={line.plannedMinor} currency={split.currency} />
                      </span>
                    </div>
                    <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full" aria-hidden>
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand),var(--accent))]"
                        style={{ width: `${Math.min(100, line.percent)}%` }}
                      />
                    </div>
                    <p className="text-muted text-xs">
                      {t('percent', { value: line.percent })}
                      {line.why ? ` · ${line.why}` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
            {split.note && <p className="text-muted text-sm">{split.note}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" disabled={busy !== null} onClick={() => void draft()}>
                <RefreshCw className="size-4" aria-hidden />
                {t('again')}
              </Button>
              <Button className="rounded-full" loading={busy === 'apply'} onClick={() => void apply()}>
                {t('apply')}
              </Button>
            </div>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
