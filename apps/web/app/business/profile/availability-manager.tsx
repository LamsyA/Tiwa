'use client';

import { Banner, Button, Card, DateField, FieldShell, Input, StatusPill } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { blockBusinessDate, confirmBusinessAvailability, unblockBusinessDate } from './actions.js';

export interface BlockRow {
  id: string;
  date: string;
  reason: string | null;
}

export function AvailabilityManager({
  orgId,
  blocks,
  confirmedAt,
  stale,
}: {
  orgId: string;
  blocks: BlockRow[];
  confirmedAt: string | null;
  stale: boolean;
}) {
  const t = useTranslations('business');
  const router = useRouter();
  const uid = React.useId();
  const [date, setDate] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  async function onBlock(event: React.FormEvent) {
    event.preventDefault();
    if (!date) return;
    const result = await blockBusinessDate({ orgId, date, reason: reason || undefined });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else {
      setDate('');
      setReason('');
      router.refresh();
    }
  }

  async function onUnblock(blockId: string) {
    const result = await unblockBusinessDate({ orgId, blockId });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else router.refresh();
  }

  async function onConfirm() {
    const result = await confirmBusinessAvailability({ orgId });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold tracking-tight">{t('availabilityHeading')}</h3>
          <StatusPill tone={stale ? 'warning' : 'success'}>
            {confirmedAt
              ? stale
                ? t('stale', { date: confirmedAt.slice(0, 10) })
                : t('confirmed', { date: confirmedAt.slice(0, 10) })
              : t('neverConfirmed')}
          </StatusPill>
        </div>
        <p className="text-muted text-sm">{t('availabilityBody')}</p>
        {error && <Banner tone="danger">{error}</Banner>}
        <Button onClick={onConfirm}>{t('confirmAvailability')}</Button>
        <form onSubmit={onBlock} className="flex flex-wrap items-end gap-2">
          <FieldShell id={`${uid}-date`} label={t('blockDate')}>
            {(describedBy) => (
              <DateField id={`${uid}-date`} aria-describedby={describedBy} value={date} onValueChange={setDate} />
            )}
          </FieldShell>
          <FieldShell id={`${uid}-reason`} label={t('blockReason')}>
            {(describedBy) => (
              <Input
                id={`${uid}-reason`}
                aria-describedby={describedBy}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </FieldShell>
          <Button type="submit" variant="secondary" disabled={!date}>
            {t('blockDate')}
          </Button>
        </form>
        {blocks.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium">{t('blocked')}</h4>
            <ul className="flex flex-col gap-2">
              {blocks.map((block) => (
                <li key={block.id} className="border-border flex items-center gap-3 rounded-lg border p-2 text-sm">
                  <span className="font-medium">{block.date.slice(0, 10)}</span>
                  {block.reason && <span className="text-muted flex-1 truncate">{block.reason}</span>}
                  <Button variant="ghost" onClick={() => void onUnblock(block.id)}>
                    {t('unblock')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
