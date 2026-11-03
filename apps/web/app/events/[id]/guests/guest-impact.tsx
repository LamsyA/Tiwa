'use client';

import { Banner, Button, Input, ResponsiveDialog, StatusPill } from '@tiwa/ui';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { AiNote, AiThinking, AiTrigger, aiErrorKey } from '@/components/ai/ai-ui.js';
import { guestImpactAction } from './actions.js';

interface Impact {
  fromGuests: number;
  toGuests: number;
  items: { area: string; change: string; action: string; urgency: 'high' | 'medium' | 'low' }[];
}

const TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const;

/**
 * "What if the guest count changes?" (AI-03, P15-T04): enter a new number,
 * get a list of what it affects across bookings, seating and invites.
 * A checklist to act on; it changes nothing by itself.
 */
export function GuestImpact({ eventId, current }: { eventId: string; current: number }) {
  const t = useTranslations('ai.impact');
  const te = useTranslations('ai.errors');
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState(String(current > 0 ? current + 20 : 50));
  const [result, setResult] = React.useState<Impact | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setError(null);
    setBusy(true);
    const response = await guestImpactAction({ eventId, toGuests: Number(count) });
    setBusy(false);
    if (!response.ok) {
      const key = aiErrorKey(response);
      setError(te.has(key) ? te(key as 'generic') : te('generic'));
      return;
    }
    setResult(response.data);
  }

  const valid = Number.isInteger(Number(count)) && Number(count) > 0;
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResult(null);
          setError(null);
        }
      }}
      trigger={<AiTrigger onClick={() => setOpen(true)}>{t('trigger')}</AiTrigger>}
      title={t('title')}
      description={t('subtitle')}
      className="md:max-w-xl"
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium">{t('newCount')}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && valid) void run();
              }}
            />
          </label>
          <Button className="rounded-full" disabled={!valid || busy} onClick={() => void run()}>
            {result ? <RefreshCw className="size-4" aria-hidden /> : null}
            {result ? t('again') : t('check')}
          </Button>
        </div>
        {busy ? (
          <AiThinking label={t('thinking')} />
        ) : (
          result && (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold">
                {result.fromGuests} <ArrowRight className="size-4" aria-hidden /> {result.toGuests} {t('guests')}
              </p>
              <ul className="flex flex-col gap-2">
                {result.items.map((item, i) => (
                  <li key={i} className="border-border/70 flex flex-col gap-1 rounded-2xl border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 font-semibold">{item.area}</span>
                      <StatusPill tone={TONE[item.urgency]}>{t(`urgency.${item.urgency}`)}</StatusPill>
                    </div>
                    <p>{item.change}</p>
                    <p className="text-muted">→ {item.action}</p>
                  </li>
                ))}
              </ul>
            </>
          )
        )}
        <AiNote>
          <p>{t('note')}</p>
        </AiNote>
      </div>
    </ResponsiveDialog>
  );
}
