'use client';

import { Button, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { reportReviewAction } from '../../app/vendors/[slug]/actions.js';

/** Report a review (REV-06): signed-in users only; staff decide in admin. */
export function ReviewReportButton({ reviewId }: { reviewId: string }) {
  const t = useTranslations('marketplace');
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) return <p className="text-muted text-sm">{t('reviewReported')}</p>;
  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {t('reviewReport')}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-danger text-sm">{error}</p>}
      <Input
        aria-label={t('reviewReportReason')}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={t('reviewReportReason')}
      />
      <div className="flex gap-2">
        <Button
          disabled={pending || !reason.trim()}
          onClick={() =>
            start(async () => {
              const result = await reportReviewAction({ reviewId, reason: reason.trim() });
              if (!result.ok) setError('saveFailed');
              else setDone(true);
            })
          }
        >
          {t('reviewReportSubmit')}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
