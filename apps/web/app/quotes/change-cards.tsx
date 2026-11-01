'use client';

import { Banner, Button, Card, StatusPill } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { respondChangeAction } from '../events/[id]/bookings/actions.js';

export interface PendingChangeRow {
  id: string;
  version: number;
  totalMinor: string;
  reason: string | null;
  booking: { id: string; eventId: string; event: { name: string } };
}

/** Vendor answers incoming change requests (P7-T08): accept supersedes, decline keeps v1. */
export function ChangeCards({ changes }: { changes: PendingChangeRow[] }) {
  const t = useTranslations('bookings');
  const te = useTranslations('bookings.errors');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  async function onRespond(versionId: string, accept: boolean) {
    const result = await respondChangeAction({ versionId, accept });
    if (!result.ok) setError(te(result.code as 'VALIDATION'));
    else router.refresh();
  }

  if (changes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-medium">{t('versionsHeading')}</h2>
      {error && <Banner tone="danger">{error}</Banner>}
      <ul className="flex flex-col gap-2">
        {changes.map((row) => (
          <li key={row.id}>
            <Card>
              <div className="flex flex-col gap-2 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-medium">
                    {row.booking.event.name} · v{row.version}
                  </p>
                  <StatusPill tone="brand">{t('pendingBadge')}</StatusPill>
                </div>
                {row.reason && <p className="text-muted">{row.reason}</p>}
                <div className="flex gap-2">
                  <Button onClick={() => void onRespond(row.id, true)}>{t('acceptChange')}</Button>
                  <Button variant="secondary" onClick={() => void onRespond(row.id, false)}>
                    {t('declineChange')}
                  </Button>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
