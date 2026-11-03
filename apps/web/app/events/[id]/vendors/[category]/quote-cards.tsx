'use client';

import {
  Banner,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  MoneyText,
  ResponsiveDialog,
  StatusPill,
  Textarea,
} from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { acceptQuoteAction, declineQuoteAction, requestChangesAction } from '../actions.js';

interface QuoteView {
  id: string;
  vendorName: string;
  status: string;
  items: { name: string; qty: number; unitMinor: string }[];
  subtotalMinor: string | null;
  totalMinor: string | null;
  currency: string;
  notes: string | null;
  cancellationTerms: string;
  schedule: { label: string; percentBps?: number; amountMinor?: string | null; due: string }[];
  expiresAt: string;
}

function errorKey(
  code: string,
):
  | 'VALIDATION'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'LIMIT_REACHED'
  | 'INVALID_TRANSITION'
  | 'FEATURE_DISABLED'
  | 'generic' {
  return [
    'VALIDATION',
    'CONFLICT',
    'FORBIDDEN',
    'NOT_FOUND',
    'LIMIT_REACHED',
    'INVALID_TRANSITION',
    'FEATURE_DISABLED',
  ].includes(code)
    ? (code as 'VALIDATION')
    : 'generic';
}

function QuoteCard({
  category,
  quote,
  heldEnabled,
  onlineEnabled,
  onDone,
}: {
  category: string;
  quote: QuoteView;
  heldEnabled: boolean;
  onlineEnabled: boolean;
  onDone: (bookingId?: string) => void;
}) {
  const t = useTranslations('quotes');
  const te = useTranslations('quotes.errors');
  const [error, setError] = React.useState<string | null>(null);
  const [changesOpen, setChangesOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'DIRECT' | 'HELD' | 'OFFLINE'>(onlineEnabled ? 'DIRECT' : 'OFFLINE');
  const [agreed, setAgreed] = React.useState(false);
  const [declineOthers, setDeclineOthers] = React.useState(true);
  const [working, setWorking] = React.useState(false);
  const expired = new Date(quote.expiresAt) <= new Date();

  async function onDecline() {
    setWorking(true);
    const result = await declineQuoteAction({ quoteId: quote.id });
    setWorking(false);
    if (!result.ok) setError(te(errorKey(result.code)));
    else onDone();
  }

  async function onSendChanges() {
    setWorking(true);
    const result = await requestChangesAction({ quoteId: quote.id, message });
    setWorking(false);
    if (!result.ok) setError(te(errorKey(result.code)));
    else {
      setChangesOpen(false);
      setMessage('');
      onDone();
    }
  }

  async function onAccept() {
    if (!agreed) return;
    setWorking(true);
    const result = await acceptQuoteAction({ quoteId: quote.id, paymentMode: mode, declineOthers });
    setWorking(false);
    if (!result.ok) setError(te(errorKey(result.code)));
    else {
      setAcceptOpen(false);
      onDone(result.data.bookingId);
    }
  }

  const actionable = (quote.status === 'SENT' || quote.status === 'CHANGES_REQUESTED') && !expired;

  return (
    <Card>
      <div className="flex flex-col gap-2 p-4 text-sm">
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex items-center gap-2">
          <p className="flex-1 font-medium">{quote.vendorName}</p>
          <StatusPill tone={quote.status === 'SENT' ? 'success' : quote.status === 'ACCEPTED' ? 'brand' : 'neutral'}>
            {expired && actionable ? t('expired') : quote.status}
          </StatusPill>
        </div>
        {quote.items.length > 0 && (
          <ul className="text-muted flex flex-col gap-0.5">
            {quote.items.map((item, i) => (
              <li key={i}>
                {item.name} × {item.qty}
              </li>
            ))}
          </ul>
        )}
        <p className="font-medium">
          {t('total')}:{' '}
          {quote.totalMinor == null ? (
            <span className="text-muted font-normal">{t('hiddenByPlanner')}</span>
          ) : (
            <MoneyText value={quote.totalMinor} currency={quote.currency} />
          )}
        </p>
        <p className="text-muted">{t('expiresLabel', { date: new Date(quote.expiresAt).toLocaleDateString() })}</p>
        <h4 className="font-medium">{t('scheduleHeading')}</h4>
        <ul className="text-muted flex flex-col gap-0.5">
          {quote.schedule.map((entry, i) => (
            <li key={i}>
              {entry.label} ·{' '}
              {entry.percentBps !== undefined
                ? `${entry.percentBps / 100}%`
                : (entry.amountMinor ?? t('hiddenByPlanner'))}{' '}
              · {entry.due}
            </li>
          ))}
        </ul>
        {actionable && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => setAcceptOpen(true)}>{t('accept')}</Button>
            <Button variant="secondary" onClick={() => setChangesOpen(true)}>
              {t('requestChanges')}
            </Button>
            <ConfirmDialog
              trigger={<Button variant="secondary">{t('decline')}</Button>}
              title={t('declineTitle')}
              body={t('declineBody')}
              confirmLabel={t('decline')}
              onConfirm={() => void onDecline()}
            />
          </div>
        )}
        <ResponsiveDialog open={changesOpen} onOpenChange={setChangesOpen} title={t('requestChanges')}>
          <div className="flex flex-col gap-3 p-4">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('changesPlaceholder')}
            />
            <Button disabled={working || !message.trim()} onClick={() => void onSendChanges()}>
              {t('sendChanges')}
            </Button>
          </div>
        </ResponsiveDialog>
        <ResponsiveDialog open={acceptOpen} onOpenChange={setAcceptOpen} title={t('acceptTitle')}>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-muted text-sm">{t('acceptBody')}</p>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{t('paymentModeLabel')}</legend>
              {(['DIRECT', 'HELD', 'OFFLINE'] as const)
                // Online modes need a real payment provider (lean P8, D-X27); Held also needs its flag.
                .filter((option) => option === 'OFFLINE' || (onlineEnabled && (option !== 'HELD' || heldEnabled)))
                .map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`mode-${quote.id}`}
                      checked={mode === option}
                      onChange={() => setMode(option)}
                    />
                    {t(option === 'DIRECT' ? 'payDirect' : option === 'HELD' ? 'payHeld' : 'payOffline')}
                  </label>
                ))}
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={declineOthers} onCheckedChange={(checked) => setDeclineOthers(checked === true)} />
              {t('declineOthersLabel', { category })}
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={agreed} onCheckedChange={(checked) => setAgreed(checked === true)} />
              {t('agreeTerms')}
            </label>
            <Button disabled={working || !agreed} onClick={() => void onAccept()}>
              {t('acceptAndContinue')}
            </Button>
          </div>
        </ResponsiveDialog>
      </div>
    </Card>
  );
}

export function QuoteCards({
  eventId,
  category,
  heldEnabled,
  onlineEnabled,
  quotes,
}: {
  eventId: string;
  category: string;
  heldEnabled: boolean;
  onlineEnabled: boolean;
  quotes: QuoteView[];
}) {
  const t = useTranslations('quotes');
  const router = useRouter();
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {bookingId && (
        <Banner tone="info">
          <Link href={`/events/${eventId}/bookings/${bookingId}`} className="text-brand-strong font-medium underline-offset-4 hover:underline">
            {t('viewBooking')}
          </Link>
        </Banner>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {quotes.map((quote) => (
          <QuoteCard
            key={quote.id}
            category={category}
            quote={quote}
            heldEnabled={heldEnabled}
            onlineEnabled={onlineEnabled}
            onDone={(created) => {
              if (created) setBookingId(created);
              router.refresh();
            }}
          />
        ))}
      </div>
    </div>
  );
}
