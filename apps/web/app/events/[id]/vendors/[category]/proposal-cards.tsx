'use client';

import {
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  MoneyText,
  ResponsiveDialog,
  StatusPill,
  Textarea,
  cn,
} from '@tiwa/ui';
import {
  CalendarClock,
  Hourglass,
  RefreshCw,
  CheckCircle2,
  FileSignature,
  Quote as QuoteIcon,
  ShieldCheck,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { QuoteHistory } from '@tiwa/core';
import { ProposalHistory } from '@/components/quotes/proposal-history.js';
import { acceptQuoteAction, declineQuoteAction, requestChangesAction } from '../actions.js';

// Planner proposals (D-X64): the host's view of a planner's answer, laid out
// as a proposal document — scope of work, payment plan in real amounts,
// the planner's note and terms — with one clear "Accept & hire" step.

export interface ProposalView {
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
  changeRequest?: string | null;
  revision?: number;
  history?: QuoteHistory | null;
}

type ErrorCode =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'LIMIT_REACHED'
  | 'INVALID_TRANSITION'
  | 'FEATURE_DISABLED'
  | 'generic';

function errorKey(code: string): ErrorCode {
  return [
    'VALIDATION',
    'CONFLICT',
    'FORBIDDEN',
    'NOT_FOUND',
    'LIMIT_REACHED',
    'INVALID_TRANSITION',
    'FEATURE_DISABLED',
  ].includes(code)
    ? (code as ErrorCode)
    : 'generic';
}

/** One payment-plan entry in minor units: a fixed amount, or its share of the total. */
function entryAmount(entry: ProposalView['schedule'][number], totalMinor: string | null): string | null {
  if (entry.amountMinor) return entry.amountMinor;
  if (entry.percentBps === undefined || totalMinor == null) return null;
  return ((BigInt(totalMinor) * BigInt(entry.percentBps)) / 10_000n).toString();
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function ProposalCard({
  proposal,
  eventId,
  heldEnabled,
  onlineEnabled,
  onDone,
}: {
  proposal: ProposalView;
  eventId: string;
  heldEnabled: boolean;
  onlineEnabled: boolean;
  onDone: (bookingId?: string) => void;
}) {
  const t = useTranslations('proposals');
  const te = useTranslations('quotes.errors');
  const [error, setError] = React.useState<string | null>(null);
  const [changesOpen, setChangesOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'DIRECT' | 'HELD' | 'OFFLINE'>(onlineEnabled ? 'DIRECT' : 'OFFLINE');
  const [agreed, setAgreed] = React.useState(false);
  const [declineOthers, setDeclineOthers] = React.useState(true);
  const [working, setWorking] = React.useState(false);
  const expired = new Date(proposal.expiresAt) <= new Date();
  // While the planner revises, only declining makes sense (D-X66).
  const actionable = proposal.status === 'SENT' && !expired;
  const waiting = proposal.status === 'CHANGES_REQUESTED' && !expired;
  const revised = proposal.status === 'SENT' && (proposal.revision ?? 1) > 1;
  const accepted = proposal.status === 'ACCEPTED';
  const validUntil = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(proposal.expiresAt),
  );

  const dueLabel = (due: string): string => {
    if (due === 'on_accept') return t('due.onAccept');
    const before = /^days_before:(\d+)$/.exec(due);
    if (before) return t('due.daysBefore', { days: Number(before[1]) });
    const onDate = /^date:(\d{4}-\d{2}-\d{2})$/.exec(due);
    if (onDate) {
      return t('due.onDate', {
        date: new Intl.DateTimeFormat('en', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${onDate[1]}T00:00:00Z`)),
      });
    }
    return t('due.onEventDay');
  };

  async function run(
    action: () => Promise<{ ok: true; data?: unknown } | { ok: false; code: string }>,
    after: () => void,
  ) {
    setError(null);
    setWorking(true);
    const result = await action();
    setWorking(false);
    if (!result.ok) setError(te(errorKey(result.code)));
    else after();
  }

  const statusText = accepted
    ? t('status.ACCEPTED')
    : expired && (proposal.status === 'SENT' || proposal.status === 'CHANGES_REQUESTED')
      ? t('status.EXPIRED')
      : t.has(`status.${proposal.status}`)
        ? t(`status.${proposal.status}` as 'status.SENT')
        : proposal.status;

  return (
    <article
      className={cn(
        'border-border/70 bg-surface relative flex flex-col overflow-hidden rounded-3xl border shadow-[var(--shadow-1)]',
        accepted && 'ring-success/40 ring-2',
      )}
    >
      {/* Letterhead */}
      <header className="from-brand-strong relative overflow-hidden bg-gradient-to-br to-[#7a2a12] px-6 pt-6 pb-5 text-white">
        <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold ring-1 ring-white/25 backdrop-blur">
              {initials(proposal.vendorName)}
            </span>
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold whitespace-nowrap text-[#3a1a0e]">
              {statusText}
            </span>
          </div>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">
              {t('eyebrow')}
              {revised && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f2b705] px-2 py-0.5 tracking-normal text-[#3a1a0e] normal-case">
                  <RefreshCw aria-hidden className="size-3" />
                  {t('revisedPill', { revision: proposal.revision ?? 2 })}
                </span>
              )}
            </p>
            <h3 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{proposal.vendorName}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75">
              <CalendarClock aria-hidden className="size-3.5 shrink-0" />
              {t('validUntil', { date: validUntil })}
            </p>
          </div>
        </div>
        <div className="relative mt-5 flex items-end justify-between gap-3 border-t border-white/15 pt-4">
          <p className="text-sm text-white/75">{t('planningFee')}</p>
          <p className="font-display text-3xl font-bold tracking-tight">
            {proposal.totalMinor == null ? (
              <span className="text-base font-medium text-white/80">{t('hidden')}</span>
            ) : (
              <MoneyText value={proposal.totalMinor} currency={proposal.currency} />
            )}
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-6">
        {error && <Banner tone="danger">{error}</Banner>}

        {/* Scope of work */}
        <section aria-labelledby={`scope-${proposal.id}`} className="flex flex-col gap-3">
          <h4 id={`scope-${proposal.id}`} className="text-muted text-xs font-semibold tracking-[0.14em] uppercase">
            {t('scopeHeading')}
          </h4>
          <ul className="divide-border/70 border-border/70 divide-y rounded-2xl border">
            {proposal.items.map((item, index) => (
              <li key={index} className="flex items-start gap-3 px-4 py-3">
                <CheckCircle2 aria-hidden className="text-brand-strong mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.name}</p>
                  {item.qty > 1 && <p className="text-muted text-xs">{t('qty', { count: item.qty })}</p>}
                </div>
                {proposal.totalMinor != null && (
                  <p className="text-sm font-semibold tabular-nums">
                    <MoneyText
                      value={(BigInt(item.unitMinor) * BigInt(item.qty)).toString()}
                      currency={proposal.currency}
                    />
                  </p>
                )}
              </li>
            ))}
          </ul>
          {proposal.subtotalMinor != null &&
            proposal.totalMinor != null &&
            proposal.subtotalMinor !== proposal.totalMinor && (
              <div className="text-muted flex justify-between px-1 text-sm">
                <span>{t('subtotal')}</span>
                <MoneyText value={proposal.subtotalMinor} currency={proposal.currency} />
              </div>
            )}
        </section>

        {/* Payment plan */}
        <section aria-labelledby={`plan-${proposal.id}`} className="flex flex-col gap-3">
          <h4 id={`plan-${proposal.id}`} className="text-muted text-xs font-semibold tracking-[0.14em] uppercase">
            {t('paymentPlanHeading')}
          </h4>
          <ol className="relative flex flex-col gap-3 pl-6">
            <span aria-hidden className="bg-border absolute top-2 bottom-2 left-[7px] w-px" />
            {proposal.schedule.map((entry, index) => {
              const amount = entryAmount(entry, proposal.totalMinor);
              return (
                <li key={index} className="relative flex items-start justify-between gap-3">
                  <span
                    aria-hidden
                    className="border-brand-strong bg-surface absolute top-1.5 -left-6 size-3.5 rounded-full border-2"
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{entry.label}</p>
                    <p className="text-muted text-xs">
                      {dueLabel(entry.due)}
                      {entry.percentBps !== undefined ? ` · ${entry.percentBps / 100}%` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {amount == null ? (
                      <span className="text-muted font-normal">{t('hidden')}</span>
                    ) : (
                      <MoneyText value={amount} currency={proposal.currency} />
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        {proposal.notes && (
          <figure className="bg-surface-2 relative rounded-2xl px-5 py-4">
            <QuoteIcon aria-hidden className="text-brand-strong/30 absolute top-3 right-4 size-6" />
            <figcaption className="text-muted mb-1 text-xs font-semibold tracking-[0.14em] uppercase">
              {t('noteHeading')}
            </figcaption>
            <blockquote className="text-sm leading-relaxed whitespace-pre-line">{proposal.notes}</blockquote>
          </figure>
        )}

        <section className="flex flex-col gap-1.5">
          <h4 className="text-muted flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] uppercase">
            <ShieldCheck aria-hidden className="size-3.5" />
            {t('termsHeading')}
          </h4>
          <p className="text-sm leading-relaxed whitespace-pre-line">{proposal.cancellationTerms}</p>
        </section>

        {proposal.changeRequest && (waiting || revised) && (
          <div
            className={cn(
              'rounded-2xl border px-4 py-3',
              waiting ? 'border-warning/30 bg-warning/10' : 'border-border/70 bg-surface-2/60',
            )}
          >
            <p
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] uppercase',
                waiting ? 'text-warning' : 'text-muted',
              )}
            >
              {waiting ? (
                <Hourglass aria-hidden className="size-3.5" />
              ) : (
                <RefreshCw aria-hidden className="size-3.5" />
              )}
              {waiting ? t('changes.waitingTitle') : t('changes.answeredTitle')}
            </p>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">“{proposal.changeRequest}”</p>
            {proposal.history && proposal.history.versions.length > 0 && (
              <ProposalHistory
                history={proposal.history}
                kind="proposal"
                viewer="host"
                counterpart={proposal.vendorName}
                eventId={eventId}
              />
            )}

            {waiting && (
              <p className="text-muted mt-2 text-xs">{t('changes.waitingBody', { planner: proposal.vendorName })}</p>
            )}
          </div>
        )}

        {accepted && (
          <p className="bg-success-soft text-success flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium">
            <UserPlus aria-hidden className="size-4" />
            {t('hiredNote', { planner: proposal.vendorName })}
          </p>
        )}

        {waiting && (
          <div className="mt-auto flex justify-end">
            <ConfirmDialog
              trigger={
                <Button variant="ghost" className="rounded-2xl whitespace-nowrap">
                  {t('decline')}
                </Button>
              }
              title={t('declineTitle', { planner: proposal.vendorName })}
              body={t('declineBody')}
              confirmLabel={t('decline')}
              onConfirm={() =>
                void run(
                  () => declineQuoteAction({ quoteId: proposal.id }),
                  () => onDone(),
                )
              }
            />
          </div>
        )}
        {actionable && (
          <div className="mt-auto flex flex-wrap gap-2 pt-1 [&>*:first-child]:flex-1">
            <Button className="rounded-2xl whitespace-nowrap" onClick={() => setAcceptOpen(true)}>
              <FileSignature aria-hidden className="size-4" />
              {t('acceptCta')}
            </Button>
            <Button variant="secondary" className="rounded-2xl whitespace-nowrap" onClick={() => setChangesOpen(true)}>
              {t('requestChanges')}
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" className="rounded-2xl whitespace-nowrap">
                  {t('decline')}
                </Button>
              }
              title={t('declineTitle', { planner: proposal.vendorName })}
              body={t('declineBody')}
              confirmLabel={t('decline')}
              onConfirm={() =>
                void run(
                  () => declineQuoteAction({ quoteId: proposal.id }),
                  () => onDone(),
                )
              }
            />
          </div>
        )}
      </div>

      <ResponsiveDialog open={changesOpen} onOpenChange={setChangesOpen} title={t('changesTitle')}>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-muted text-sm">{t('changesBody', { planner: proposal.vendorName })}</p>
          <Textarea
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t('changesPlaceholder')}
          />
          <Button
            disabled={working || !message.trim()}
            loading={working}
            onClick={() =>
              void run(
                () => requestChangesAction({ quoteId: proposal.id, message }),
                () => {
                  setChangesOpen(false);
                  setMessage('');
                  onDone();
                },
              )
            }
          >
            {t('sendChanges')}
          </Button>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        title={t('acceptTitle', { planner: proposal.vendorName })}
      >
        <div className="flex flex-col gap-5 p-4">
          <ol className="flex flex-col gap-3">
            {[
              { icon: FileSignature, text: t('accept.step1') },
              { icon: UserPlus, text: t('accept.step2', { planner: proposal.vendorName }) },
              { icon: Wallet, text: t('accept.step3') },
            ].map(({ icon: Icon, text }, index) => (
              <li key={index} className="flex items-start gap-3 text-sm">
                <span className="bg-brand-soft text-brand-strong flex size-8 shrink-0 items-center justify-center rounded-xl">
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ol>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">{t('accept.payHeading')}</legend>
            {(['DIRECT', 'HELD', 'OFFLINE'] as const)
              .filter((option) => option === 'OFFLINE' || (onlineEnabled && (option !== 'HELD' || heldEnabled)))
              .map((option) => (
                <label
                  key={option}
                  className={cn(
                    'border-border flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition',
                    mode === option && 'border-brand-strong bg-brand-soft/40 ring-brand-strong/15 ring-4',
                  )}
                >
                  <input
                    type="radio"
                    className="accent-brand-strong mt-1"
                    name={`mode-${proposal.id}`}
                    checked={mode === option}
                    onChange={() => setMode(option)}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{t(`accept.mode.${option}.title`)}</span>
                    <span className="text-muted text-xs">{t(`accept.mode.${option}.body`)}</span>
                  </span>
                </label>
              ))}
          </fieldset>

          <div className="flex flex-col gap-2.5">
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox checked={declineOthers} onCheckedChange={(checked) => setDeclineOthers(checked === true)} />
              {t('accept.declineOthers')}
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox checked={agreed} onCheckedChange={(checked) => setAgreed(checked === true)} />
              {t('accept.agree')}
            </label>
          </div>

          <Button
            size="lg"
            className="rounded-2xl"
            disabled={working || !agreed}
            loading={working}
            onClick={() =>
              void (async () => {
                if (!agreed) return;
                setError(null);
                setWorking(true);
                const result = await acceptQuoteAction({ quoteId: proposal.id, paymentMode: mode, declineOthers });
                setWorking(false);
                if (!result.ok) {
                  setAcceptOpen(false);
                  setError(te(errorKey(result.code)));
                  return;
                }
                setAcceptOpen(false);
                onDone(result.data.bookingId);
              })()
            }
          >
            {t('accept.confirm')}
          </Button>
        </div>
      </ResponsiveDialog>
    </article>
  );
}

export function ProposalCards({
  eventId,
  heldEnabled,
  onlineEnabled,
  proposals,
}: {
  eventId: string;
  heldEnabled: boolean;
  onlineEnabled: boolean;
  proposals: ProposalView[];
}) {
  const t = useTranslations('proposals');
  const router = useRouter();
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {bookingId && (
        <div className="border-success/30 bg-success-soft flex flex-col gap-3 rounded-3xl border p-5 sm:flex-row sm:items-center">
          <span className="bg-success flex size-11 shrink-0 items-center justify-center rounded-2xl text-white">
            <UserPlus aria-hidden className="size-5" />
          </span>
          <div className="flex-1">
            <p className="font-display text-lg font-bold">{t('hiredTitle')}</p>
            <p className="text-muted text-sm">{t('hiredBody')}</p>
          </div>
          <Link
            href={`/events/${eventId}/bookings/${bookingId}`}
            className="bg-success inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold text-white"
          >
            {t('viewAgreement')}
          </Link>
        </div>
      )}
      <div className={cn('grid gap-5', proposals.length > 1 && 'lg:grid-cols-2')}>
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            eventId={eventId}
            heldEnabled={heldEnabled}
            onlineEnabled={onlineEnabled}
            onDone={(created) => {
              if (created) setBookingId(created);
              router.refresh();
            }}
          />
        ))}
      </div>
      <p className="text-muted flex items-center gap-1.5 text-xs">
        <StatusPill tone="neutral">{t('legalPill')}</StatusPill>
        {t('legalNote')}
      </p>
    </div>
  );
}
