'use client';

import { Button, Card } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { requestMomentsZip } from './actions.js';

/**
 * Gallery takeout (P5-T11, MOM-13): packs published originals into a ZIP and
 * emails a 7-day link. Repeat requests within the hour reuse the pending row.
 */
export function ZipPanel({
  eventId,
  lastZip,
}: {
  eventId: string;
  lastZip: {
    id: string;
    status: 'PENDING' | 'READY' | 'FAILED';
    itemCount: number;
    sizeBytes: number | null;
    createdAt: string;
  } | null;
}) {
  const t = useTranslations('events.momentsPage');
  const te = useTranslations('events.momentsPage.errors');
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(false);

  async function request() {
    setBusy(true);
    setError(false);
    try {
      const result = await requestMomentsZip({ eventId });
      if (!result.ok) setError(true);
      else router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="font-display text-base font-bold tracking-tight">{t('zipTitle')}</h3>
        <p className="text-muted text-sm">{t('zipBody')}</p>
      </div>
      {error && <p className="text-danger text-sm">{te('generic')}</p>}
      {(!lastZip || lastZip.status === 'FAILED') && (
        <div>
          <Button type="button" variant="secondary" loading={busy} onClick={() => void request()}>
            {t('requestZip')}
          </Button>
        </div>
      )}
      {lastZip?.status === 'PENDING' && (
        <p className="text-muted text-sm" role="status">
          {t('zipPending')}
        </p>
      )}
      {lastZip?.status === 'READY' && (
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">
            {t('zipReady')} · {lastZip.itemCount}
          </p>
          <Button type="button" variant="secondary" loading={busy} onClick={() => void request()}>
            {t('requestZip')}
          </Button>
        </div>
      )}
    </Card>
  );
}
