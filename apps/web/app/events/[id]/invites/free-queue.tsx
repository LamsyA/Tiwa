'use client';

import type { FreeModeItem } from '@tiwa/core';
import { waMeLink } from '@tiwa/messaging/wame';
import { Avatar, Banner, Button, Card, ProgressBar } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { markSentManuallyAction } from './actions.js';

/**
 * WhatsApp free-mode queue (UF-07 step 7): one guest at a time, biggest
 * card on the screen. [Open WhatsApp] deep-links with the message
 * prefilled; the host sends there, returns, and taps [Mark sent].
 * [Skip] moves on without recording anything.
 */
export function FreeQueue({ items }: { items: FreeModeItem[] }) {
  const t = useTranslations('events.invites.queue');
  const te = useTranslations('events.invites.errors');
  const router = useRouter();
  const [index, setIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [skipped, setSkipped] = React.useState<string[]>([]);

  const remaining = items.filter((item) => !skipped.includes(item.deliveryId));
  const current = remaining[Math.min(index, remaining.length - 1)];
  const doneCount = items.length - remaining.length;

  async function markSent(deliveryId: string) {
    setBusy(true);
    setError(undefined);
    const result = await markSentManuallyAction({ deliveryId });
    setBusy(false);
    if (!result.ok) {
      try {
        setError(te(result.code));
      } catch {
        setError(te('generic'));
      }
      return;
    }
    router.refresh();
  }

  if (items.length === 0) return null;
  if (!current) {
    return (
      <Card className="p-4">
        <p role="status" className="font-medium">
          {t('done')}
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium">{t('title')}</h3>
        <p className="text-muted text-sm">{t('left', { count: remaining.length })}</p>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <ProgressBar
        value={doneCount}
        max={items.length}
        label={t('position', { position: doneCount + 1, total: items.length })}
      />
      <div className="flex items-center gap-3">
        <Avatar name={current.guestName} />
        <div className="min-w-0">
          <p className="font-display text-lg font-bold">{t('sendTo', { name: current.guestName })}</p>
          <p className="text-muted text-sm">{t('position', { position: current.position, total: current.total })}</p>
        </div>
      </div>
      <p className="bg-surface-2 rounded-lg p-3 text-sm whitespace-pre-wrap">{current.text}</p>
      <p className="text-muted text-sm">{t('hint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            window.open(waMeLink(current.phone, current.text), '_blank', 'noopener');
          }}
        >
          {t('open')}
        </Button>
        <Button variant="secondary" loading={busy} onClick={() => void markSent(current.deliveryId)}>
          {t('sent')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSkipped((prev) => [...prev, current.deliveryId]);
            setIndex((i) => i + 1);
          }}
        >
          {t('skip')}
        </Button>
      </div>
    </Card>
  );
}
