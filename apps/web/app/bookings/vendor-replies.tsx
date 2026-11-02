'use client';

import { Button, Card, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { replyToReviewAction, vendorReportReviewAction } from './actions.js';

export interface PendingReply {
  id: string;
  bookingId: string;
  overall: number;
  body: string | null;
  eventName: string | null;
  category: string | null;
  createdAt: string;
}

/** Vendor workspace: answer host reviews once, report abuse (P14-T03). */
export function VendorReplies({ rows }: { rows: PendingReply[] }) {
  const t = useTranslations('vendor');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reporting, setReporting] = useState<string | null>(null);

  if (rows.length === 0) return null;

  const reply = (reviewId: string) => {
    setError(null);
    start(async () => {
      const result = await replyToReviewAction({ reviewId, body: (bodies[reviewId] ?? '').trim() });
      if (!result.ok) setError('saveFailed');
    });
  };

  const report = (reviewId: string) => {
    setError(null);
    start(async () => {
      const result = await vendorReportReviewAction({ reviewId, reason: (reasons[reviewId] ?? '').trim() });
      if (!result.ok) setError('saveFailed');
      else setReporting(null);
    });
  };

  return (
    <Card className="flex flex-col gap-2 p-3">
      <h2 className="font-display text-lg font-bold">{t('reviewsHeading')}</h2>
      {error && <p className="text-danger text-sm">{error}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="border-border flex flex-col gap-2 rounded-xl border p-3 text-sm">
            <p className="font-medium">
              ★ {row.overall.toFixed(1)}
              {row.eventName ? ` · ${row.eventName}` : ''}
              {row.category ? ` · ${row.category}` : ''}
            </p>
            {row.body && <p className="text-muted">{row.body}</p>}
            <Input
              aria-label={t('reviewReplyLabel')}
              value={bodies[row.id] ?? ''}
              onChange={(event) => setBodies((prev) => ({ ...prev, [row.id]: event.target.value }))}
              placeholder={t('reviewReplyLabel')}
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || !(bodies[row.id] ?? '').trim()} onClick={() => reply(row.id)}>
                {t('reviewReplySubmit')}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => setReporting(reporting === row.id ? null : row.id)}
              >
                {t('reviewReportLabel')}
              </Button>
            </div>
            {reporting === row.id && (
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label={t('reviewReportReason')}
                  value={reasons[row.id] ?? ''}
                  onChange={(event) => setReasons((prev) => ({ ...prev, [row.id]: event.target.value }))}
                  placeholder={t('reviewReportReason')}
                  className="min-w-40 flex-1"
                />
                <Button
                  variant="secondary"
                  disabled={pending || !(reasons[row.id] ?? '').trim()}
                  onClick={() => report(row.id)}
                >
                  {t('reviewReportSubmit')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
