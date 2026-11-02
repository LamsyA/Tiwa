'use client';

import { Button, Card } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { markAllAction, markReadAction } from './actions.js';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  readAt: string | null;
  createdAt: string;
}

/** In-app inbox (P13-T03): newest first; opening an item marks it read. */
export function NotificationList({ rows }: { rows: NotificationRow[] }) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = (row: NotificationRow) => {
    setError(null);
    start(async () => {
      if (!row.readAt) {
        const result = await markReadAction({ notificationId: row.id });
        if (!result.ok) setError('saveFailed');
      }
      router.push(row.url);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-danger text-sm">{error}</p>}
      {rows.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await markAllAction({});
                if (!result.ok) setError('saveFailed');
              })
            }
          >
            {t('markAll')}
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <Card className="p-4">
          <p className="text-muted text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Card className={`flex flex-col gap-1 p-3 text-sm ${row.readAt ? '' : 'border-brand-strong'}`}>
                <button type="button" onClick={() => open(row)} className="flex flex-col gap-1 text-left">
                  <span className="font-medium">{row.title}</span>
                  <span className="text-muted">{row.body}</span>
                  <span className="text-muted text-xs">
                    {new Date(row.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
