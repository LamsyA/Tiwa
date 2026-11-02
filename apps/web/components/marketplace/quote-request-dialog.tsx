'use client';

import { Banner, Button, MoneyInput, ResponsiveDialog, Select, Textarea, buttonClasses } from '@tiwa/ui';
import { CheckCircle2, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { requestQuoteAction } from './actions.js';

export interface QuoteEventOption {
  id: string;
  name: string;
  when: string | null;
  currency: string;
}

/**
 * "Request a quote" on a vendor's profile (D-X39): pick the event and the
 * service, add a note, send. The brief (date, venue, guest count) is filled
 * in from the event on the server, so the host only types what is special.
 */
export function QuoteRequestDialog({
  vendorOrgId,
  vendorName,
  events,
  categories,
  defaultEventId,
  signInHref,
}: {
  vendorOrgId: string;
  vendorName: string;
  events: QuoteEventOption[];
  categories: { key: string; label: string }[];
  defaultEventId?: string | undefined;
  /** Shown instead of the form when nobody is signed in. */
  signInHref?: string | undefined;
}) {
  const t = useTranslations('marketplace.quoteRequest');
  const te = useTranslations('quotes.errors');
  const [open, setOpen] = React.useState(false);
  const [eventId, setEventId] = React.useState(defaultEventId ?? events[0]?.id ?? '');
  const [category, setCategory] = React.useState(categories[0]?.key ?? '');
  const [notes, setNotes] = React.useState('');
  const [budget, setBudget] = React.useState('0');
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const currency = events.find((row) => row.id === eventId)?.currency ?? 'NGN';

  if (signInHref) {
    return (
      <Link href={signInHref} className={buttonClasses({ className: 'w-full rounded-full' })}>
        <FileText aria-hidden className="size-4" />
        {t('cta')}
      </Link>
    );
  }

  async function onSend() {
    setError(null);
    setSending(true);
    try {
      const result = await requestQuoteAction({
        eventId,
        vendorOrgId,
        category,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(budget && budget !== '0' ? { budgetMaxMinor: budget } : {}),
      });
      if (!result.ok) {
        setError(
          result.code === 'CONFLICT' ? t('alreadyAsked') : te.has(result.code) ? te(result.code) : te('generic'),
        );
        return;
      }
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSent(false);
          setError(null);
        }
      }}
      trigger={
        <Button className="w-full rounded-full">
          <FileText aria-hidden className="size-4" />
          {t('cta')}
        </Button>
      }
      title={t('title', { vendor: vendorName })}
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="bg-success-soft text-success flex size-12 items-center justify-center rounded-2xl">
            <CheckCircle2 aria-hidden className="size-6" />
          </span>
          <h3 className="font-display text-xl font-bold">{t('sentTitle')}</h3>
          <p className="text-muted text-sm">{t('sentBody', { vendor: vendorName })}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href={`/events/${eventId}/vendors/${category}`}
              className={buttonClasses({ className: 'rounded-full' })}
            >
              {t('track')}
            </Link>
            <Button variant="secondary" className="rounded-full" onClick={() => setOpen(false)}>
              {t('close')}
            </Button>
          </div>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-muted text-sm">{t('noEvents')}</p>
          <Link href="/events/new" className={buttonClasses({ className: 'rounded-full' })}>
            {t('createEvent')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-muted text-sm">{t('body')}</p>
          {error && <Banner tone="danger">{error}</Banner>}
          <Select
            label={t('event')}
            value={eventId}
            onValueChange={setEventId}
            options={events.map((row) => ({ value: row.id, label: row.when ? `${row.name} · ${row.when}` : row.name }))}
          />
          <Select
            label={t('service')}
            value={category}
            onValueChange={setCategory}
            options={categories.map((row) => ({ value: row.key, label: row.label }))}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="quote-notes" className="text-sm font-medium">
              {t('notes')}
            </label>
            <Textarea
              id="quote-notes"
              rows={4}
              value={notes}
              placeholder={t('notesPlaceholder')}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="quote-budget" className="text-sm font-medium">
              {t('budget')}
            </label>
            <MoneyInput id="quote-budget" currency={currency} value={budget} onValueChange={setBudget} />
          </div>
          <p className="text-muted text-xs">{t('briefNote')}</p>
          <Button loading={sending} disabled={!eventId || !category} onClick={() => void onSend()}>
            {t('send')}
          </Button>
        </div>
      )}
    </ResponsiveDialog>
  );
}
