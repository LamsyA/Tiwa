'use client';

import { Banner, Button, Input, ResponsiveDialog, Textarea } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { requestSiteVisitAction } from './actions.js';

/** Site visit request (P7-T11): host proposes up to 3 times to tour the venue. */
export function SiteVisitDialog({
  eventId,
  vendorOrgId,
  spaceId,
}: {
  eventId: string;
  vendorOrgId: string;
  spaceId?: string;
}) {
  const t = useTranslations('marketplace');
  const te = useTranslations('marketplace.errors');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [times, setTimes] = React.useState(['']);
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  async function onSend() {
    setError(null);
    setWorking(true);
    try {
      const result = await requestSiteVisitAction({
        eventId,
        vendorOrgId,
        spaceId,
        proposedTimes: times.filter(Boolean).map((time) => new Date(time).toISOString()),
        notes: notes || undefined,
      });
      if (!result.ok) setError(te(result.code as 'VALIDATION'));
      else {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('visitTitle')}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t('visitTitle')}>
        <div className="flex flex-col gap-3 p-4 text-sm">
          {error && <Banner tone="danger">{error}</Banner>}
          {times.map((time, i) => (
            <Input
              key={i}
              aria-label={`${t('proposeLabel')} ${i + 1}`}
              type="datetime-local"
              value={time}
              onChange={(e) => {
                const next = [...times];
                next[i] = e.target.value;
                setTimes(next);
              }}
            />
          ))}
          {times.length < 3 && (
            <Button variant="secondary" onClick={() => setTimes([...times, ''])}>
              {t('addTime')}
            </Button>
          )}
          <label className="flex flex-col gap-1">
            {t('visitNotesLabel')}
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <Button disabled={working || times.filter(Boolean).length === 0} onClick={() => void onSend()}>
            {t('sendVisit')}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
