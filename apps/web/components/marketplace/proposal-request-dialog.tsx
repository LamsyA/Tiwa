'use client';

import { PLANNING_CATEGORY } from '@tiwa/config/event-types';
import { Banner, Button, MoneyInput, ResponsiveDialog, Select, Textarea, buttonClasses, cn } from '@tiwa/ui';
import { CalendarCheck, CheckCircle2, ClipboardList, FileSignature, Handshake, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { requestQuoteAction } from './actions.js';
import type { QuoteEventOption } from './quote-request-dialog.js';

// "Request a proposal" on a planner's profile (D-X64). D-X101: the scope is
// not fixed upfront — chatting first is the main path, and here the host may
// optionally hint at the kind of help; the planner shapes the proposal to
// what they discuss. Tiwa sends a brief built from the event.

const SCOPES = ['full', 'partial', 'dayOf', 'consultation'] as const;
type Scope = (typeof SCOPES)[number];

export function ProposalRequestDialog({
  plannerOrgId,
  plannerName,
  events,
  defaultEventId,
  signInHref,
  secondary = false,
}: {
  plannerOrgId: string;
  plannerName: string;
  events: QuoteEventOption[];
  defaultEventId?: string | undefined;
  signInHref?: string | undefined;
  /** Shown under "Chat about your event" on planner pages (D-X101). */
  secondary?: boolean;
}) {
  const t = useTranslations('proposals.request');
  const te = useTranslations('quotes.errors');
  const [open, setOpen] = React.useState(false);
  const [eventId, setEventId] = React.useState(defaultEventId ?? events[0]?.id ?? '');
  const [scope, setScope] = React.useState<Scope | null>(null);
  const [notes, setNotes] = React.useState('');
  const [budget, setBudget] = React.useState('0');
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const currency = events.find((row) => row.id === eventId)?.currency ?? 'NGN';

  if (signInHref) {
    return (
      <Link
        href={signInHref}
        className={buttonClasses({ variant: secondary ? 'secondary' : 'primary', className: 'w-full rounded-full' })}
      >
        <FileSignature aria-hidden className="size-4" />
        {t('cta')}
      </Link>
    );
  }

  async function onSend() {
    setError(null);
    setSending(true);
    try {
      const brief = [scope ? `${t('scopeLabel')}: ${t(`scope.${scope}.title`)}` : '', notes.trim()]
        .filter(Boolean)
        .join('\n\n');
      const result = await requestQuoteAction({
        eventId,
        vendorOrgId: plannerOrgId,
        category: PLANNING_CATEGORY,
        notes: brief,
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
        <Button variant={secondary ? 'secondary' : 'primary'} className="w-full rounded-full">
          <FileSignature aria-hidden className="size-4" />
          {t('cta')}
        </Button>
      }
      title={t('title', { planner: plannerName })}
    >
      {sent ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="bg-success-soft text-success flex size-14 items-center justify-center rounded-3xl">
            <CheckCircle2 aria-hidden className="size-7" />
          </span>
          <div>
            <h3 className="font-display text-2xl font-bold tracking-tight">{t('sentTitle')}</h3>
            <p className="text-muted mx-auto mt-1 max-w-sm text-sm">{t('sentBody', { planner: plannerName })}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href={`/events/${eventId}/vendors/${PLANNING_CATEGORY}`}
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
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-muted text-sm">{t('noEvents')}</p>
          <Link href="/events/new" className={buttonClasses({ className: 'rounded-full' })}>
            {t('createEvent')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <ol className="bg-surface-2 grid gap-3 rounded-2xl p-4 sm:grid-cols-3">
            {[
              { icon: ClipboardList, text: t('how.step1') },
              { icon: Sparkles, text: t('how.step2', { planner: plannerName }) },
              { icon: Handshake, text: t('how.step3') },
            ].map(({ icon: Icon, text }, index) => (
              <li key={index} className="flex items-start gap-2.5 text-xs leading-relaxed">
                <span className="bg-brand-soft text-brand-strong flex size-7 shrink-0 items-center justify-center rounded-lg">
                  <Icon aria-hidden className="size-3.5" />
                </span>
                {text}
              </li>
            ))}
          </ol>

          {error && <Banner tone="danger">{error}</Banner>}

          <Select
            label={t('event')}
            value={eventId}
            onValueChange={setEventId}
            options={events.map((row) => ({ value: row.id, label: row.when ? `${row.name} · ${row.when}` : row.name }))}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t('scopeOptional')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SCOPES.map((key) => (
                <label
                  key={key}
                  className={cn(
                    'border-border hover:border-text/25 flex cursor-pointer flex-col gap-0.5 rounded-2xl border p-3 transition',
                    scope === key && 'border-brand-strong bg-brand-soft/40 ring-brand-strong/15 ring-4',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="proposal-scope"
                      className="accent-brand-strong"
                      checked={scope === key}
                      onChange={() => setScope(scope === key ? null : key)}
                    />
                    <span className="text-sm font-semibold">{t(`scope.${key}.title`)}</span>
                  </span>
                  <span className="text-muted pl-6 text-xs">{t(`scope.${key}.body`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="proposal-notes" className="text-sm font-medium">
              {t('notes')}
            </label>
            <Textarea
              id="proposal-notes"
              rows={4}
              value={notes}
              placeholder={t('notesPlaceholder')}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="proposal-budget" className="text-sm font-medium">
              {t('budget')}
            </label>
            <MoneyInput id="proposal-budget" currency={currency} value={budget} onValueChange={setBudget} />
          </div>

          <p className="text-muted flex items-start gap-1.5 text-xs">
            <CalendarCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t('briefNote')}
          </p>
          <Button size="lg" className="rounded-2xl" loading={sending} disabled={!eventId} onClick={() => void onSend()}>
            {t('send')}
          </Button>
        </div>
      )}
    </ResponsiveDialog>
  );
}
