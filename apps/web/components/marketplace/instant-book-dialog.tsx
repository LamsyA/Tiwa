'use client';

import { Banner, Button, Input, ResponsiveDialog, Select, Textarea } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { instantBookAction } from './actions.js';

export interface InstantBookSpace {
  id: string;
  name: string;
  slotPrices: Record<string, string>;
}

/** Instant venue booking (QTE-06, P7-T10): host picks space, date and slot; price comes from the space. */
export function InstantBookDialog({
  eventId,
  vendorOrgId,
  spaces,
}: {
  eventId: string;
  vendorOrgId: string;
  spaces: InstantBookSpace[];
}) {
  const t = useTranslations('marketplace');
  const te = useTranslations('marketplace.errors');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [spaceId, setSpaceId] = React.useState(spaces[0]?.id ?? '');
  const [date, setDate] = React.useState('');
  const [slot, setSlot] = React.useState('FULL_DAY');
  const [terms, setTerms] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  async function onBook() {
    setError(null);
    setWorking(true);
    try {
      const result = await instantBookAction({
        eventId,
        vendorOrgId,
        spaceId: spaceId || undefined,
        serviceDate: date,
        slot: slot as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY',
        // No online checkout yet (lean P8, D-X27): instant bookings are paid outside Tiwa and recorded.
        paymentMode: 'OFFLINE',
        terms,
      });
      if (!result.ok) setError(te(result.code as 'VALIDATION'));
      else {
        setOpen(false);
        router.push(`/events/${eventId}/bookings/${result.data.bookingId}`);
      }
    } finally {
      setWorking(false);
    }
  }

  if (spaces.length === 0) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t('bookNow')}</Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t('instantBookTitle')}>
        <div className="flex flex-col gap-3 p-4 text-sm">
          {error && <Banner tone="danger">{error}</Banner>}
          <label className="flex flex-col gap-1">
            {t('spaceLabel')}
            <Select
              aria-label={t('spaceLabel')}
              value={spaceId}
              onValueChange={setSpaceId}
              options={spaces.map((space) => ({ value: space.id, label: space.name }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            {t('dateLabel')}
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            {t('slotLabel')}
            <Select
              aria-label={t('slotLabel')}
              value={slot}
              onValueChange={setSlot}
              options={['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY'].map((value) => ({ value, label: value }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            {t('termsLabel')}
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder={t('termsPlaceholder')} />
          </label>
          <Button disabled={working || !date || !terms.trim()} onClick={() => void onBook()}>
            {t('bookNow')}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
