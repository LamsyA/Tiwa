'use client';

import type { QuoteHistory, QuoteHistoryVersion } from '@tiwa/core';
import { MoneyText, cn } from '@tiwa/ui';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  FileText,
  History,
  Hourglass,
  MessageSquareQuote,
  Minus,
  Plus,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

// Shared quote / proposal history (D-X67): one timeline both sides read — each
// version as sent, what changed from the one before, the client's change
// request, and how it ended. Every version opens to its full contents.

type Kind = 'proposal' | 'quote';

function stamp(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

interface Diff {
  added: string[];
  removed: string[];
  repriced: string[];
  delta: bigint | null;
}

/** What changed between two versions, by line name. */
function diff(prev: QuoteHistoryVersion | undefined, next: QuoteHistoryVersion): Diff | null {
  if (!prev) return null;
  const before = new Map(prev.items.map((item) => [item.name, item]));
  const after = new Map(next.items.map((item) => [item.name, item]));
  const lineTotal = (item: { qty: number; unitMinor: string }) => BigInt(item.qty) * BigInt(item.unitMinor);
  return {
    added: next.items.filter((item) => !before.has(item.name)).map((item) => item.name),
    removed: prev.items.filter((item) => !after.has(item.name)).map((item) => item.name),
    repriced: next.items
      .filter((item) => before.has(item.name) && lineTotal(before.get(item.name)!) !== lineTotal(item))
      .map((item) => item.name),
    delta:
      prev.totalMinor != null && next.totalMinor != null ? BigInt(next.totalMinor) - BigInt(prev.totalMinor) : null,
  };
}

function Node({
  icon: Icon,
  tone,
  children,
  last,
}: {
  icon: typeof FileText;
  tone: 'brand' | 'warning' | 'success' | 'muted';
  children: React.ReactNode;
  last?: boolean;
}) {
  const ring = {
    brand: 'bg-brand-soft text-brand-strong ring-brand-strong/20',
    warning: 'bg-warning/15 text-warning ring-warning/25',
    success: 'bg-success-soft text-success ring-success/25',
    muted: 'bg-surface-2 text-muted ring-border',
  }[tone];
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span aria-hidden className="bg-border absolute top-9 bottom-0 left-[17px] w-px" />}
      <span className={cn('relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full ring-4', ring)}>
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1.5">{children}</div>
    </li>
  );
}

function VersionDetails({ version, kind }: { version: QuoteHistoryVersion; kind: Kind }) {
  const t = useTranslations('history');
  return (
    <details className="group border-border/70 bg-surface mt-3 overflow-hidden rounded-2xl border">
      <summary className="hover:bg-surface-2/60 flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold transition [&::-webkit-details-marker]:hidden">
        {t('viewVersion', { revision: version.revision, kind: t(`kind.${kind}`) })}
        <ChevronDown aria-hidden className="text-muted size-4 transition group-open:rotate-180" />
      </summary>
      <div className="border-border/70 flex flex-col gap-4 border-t px-4 py-4 text-sm">
        <ul className="flex flex-col gap-1.5">
          {version.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span className="min-w-0">
                {item.name}
                {item.qty > 1 && <span className="text-muted"> × {item.qty}</span>}
              </span>
              {version.totalMinor != null && (
                <span className="shrink-0 font-medium tabular-nums">
                  <MoneyText
                    value={(BigInt(item.unitMinor) * BigInt(item.qty)).toString()}
                    currency={version.currency}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
        {version.totalMinor != null && (
          <div className="border-border/70 flex justify-between border-t pt-3 font-semibold">
            <span>{t('total')}</span>
            <MoneyText value={version.totalMinor} currency={version.currency} />
          </div>
        )}
        <div>
          <p className="text-muted mb-1 text-xs font-semibold tracking-[0.12em] uppercase">{t('paymentPlan')}</p>
          <ul className="flex flex-col gap-1">
            {version.schedule.map((entry, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>{entry.label}</span>
                <span className="text-muted">
                  {entry.percentBps !== undefined ? `${entry.percentBps / 100}%` : ''} ·{' '}
                  {t(`due.${dueKey(entry.due)}`, dueArgs(entry.due))}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {version.notes && (
          <div>
            <p className="text-muted mb-1 text-xs font-semibold tracking-[0.12em] uppercase">{t('note')}</p>
            <p className="whitespace-pre-line">{version.notes}</p>
          </div>
        )}
        <div>
          <p className="text-muted mb-1 text-xs font-semibold tracking-[0.12em] uppercase">{t('terms')}</p>
          <p className="whitespace-pre-line">{version.cancellationTerms}</p>
        </div>
      </div>
    </details>
  );
}

function dueKey(due: string): 'onAccept' | 'daysBefore' | 'onDate' {
  if (due === 'on_accept') return 'onAccept';
  return due.startsWith('days_before:') ? 'daysBefore' : 'onDate';
}
function dueArgs(due: string): Record<string, string | number> {
  const days = /^days_before:(\d+)$/.exec(due)?.[1];
  if (days) return { days: Number(days) };
  return { date: due.replace('date:', '') };
}

export function ProposalHistory({
  history,
  kind,
  viewer,
  counterpart,
  eventId,
  defaultOpen = false,
}: {
  history: QuoteHistory;
  kind: Kind;
  /** Whose screen this is: wording says "you" for the right party. */
  viewer: 'host' | 'vendor';
  /** The other party's name. */
  counterpart: string;
  eventId?: string;
  defaultOpen?: boolean;
}) {
  const t = useTranslations('history');
  const versions = history.versions;
  if (versions.length === 0) return null;
  const latest = versions[versions.length - 1]!;
  const sender = viewer === 'vendor' ? t('you') : counterpart;
  const client = viewer === 'host' ? t('you') : counterpart;
  const ending = {
    ACCEPTED: { icon: CheckCircle2, tone: 'success' as const, text: t('end.accepted', { who: client }) },
    DECLINED: { icon: CircleSlash, tone: 'muted' as const, text: t('end.declined', { who: client }) },
    WITHDRAWN: { icon: CircleSlash, tone: 'muted' as const, text: t('end.withdrawn', { who: sender }) },
    EXPIRED: { icon: Hourglass, tone: 'muted' as const, text: t('end.expired') },
    SENT: { icon: Hourglass, tone: 'brand' as const, text: t('end.awaitingDecision', { who: client }) },
    CHANGES_REQUESTED: { icon: Hourglass, tone: 'warning' as const, text: t('end.awaitingRevision', { who: sender }) },
  }[history.status as 'SENT'];

  return (
    <details
      open={defaultOpen}
      className="group/history border-border/70 bg-surface-2/40 overflow-hidden rounded-3xl border"
    >
      <summary className="hover:bg-surface-2/70 flex cursor-pointer list-none items-center gap-3 px-5 py-4 transition [&::-webkit-details-marker]:hidden">
        <span className="bg-surface flex size-9 items-center justify-center rounded-xl shadow-[var(--shadow-1)]">
          <History aria-hidden className="text-brand-strong size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t('title', { kind: t(`kind.${kind}`) })}</span>
          <span className="text-muted block text-xs">
            {t('summary', { versions: versions.length, date: stamp(latest.sentAt) })}
          </span>
        </span>
        <ChevronDown aria-hidden className="text-muted size-4 transition group-open/history:rotate-180" />
      </summary>
      <ol className="border-border/70 border-t px-5 py-5">
        {versions.map((version, index) => {
          const change = diff(versions[index - 1], version);
          return (
            <li key={version.revision} className="contents">
              <ol className="contents">
                <Node icon={FileText} tone="brand">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold">
                      {t(index === 0 ? 'sent' : 'resent', {
                        revision: version.revision,
                        who: sender,
                        kind: t(`kind.${kind}`),
                      })}
                    </p>
                    <time className="text-muted text-xs" dateTime={version.sentAt}>
                      {stamp(version.sentAt)}
                    </time>
                  </div>
                  {version.totalMinor != null && (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-display text-lg font-bold tracking-tight">
                        <MoneyText value={version.totalMinor} currency={version.currency} />
                      </span>
                      {change?.delta != null && change.delta !== 0n && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                            change.delta > 0n ? 'bg-warning/15 text-warning' : 'bg-success-soft text-success',
                          )}
                        >
                          {change.delta > 0n ? (
                            <ArrowUpRight aria-hidden className="size-3" />
                          ) : (
                            <ArrowDownRight aria-hidden className="size-3" />
                          )}
                          <MoneyText
                            value={(change.delta > 0n ? change.delta : -change.delta).toString()}
                            currency={version.currency}
                          />
                        </span>
                      )}
                    </p>
                  )}
                  {change && (change.added.length > 0 || change.removed.length > 0 || change.repriced.length > 0) && (
                    <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      {change.added.map((name) => (
                        <li
                          key={`a-${name}`}
                          className="bg-success-soft text-success inline-flex items-center gap-1 rounded-full px-2.5 py-1"
                        >
                          <Plus aria-hidden className="size-3" />
                          {name}
                        </li>
                      ))}
                      {change.removed.map((name) => (
                        <li
                          key={`r-${name}`}
                          className="bg-surface-2 text-muted inline-flex items-center gap-1 rounded-full px-2.5 py-1 line-through"
                        >
                          <Minus aria-hidden className="size-3" />
                          {name}
                        </li>
                      ))}
                      {change.repriced.map((name) => (
                        <li key={`p-${name}`} className="bg-brand-soft text-brand-strong rounded-full px-2.5 py-1">
                          {t('repriced', { name })}
                        </li>
                      ))}
                    </ul>
                  )}
                  <VersionDetails version={version} kind={kind} />
                </Node>
                {version.changeRequest && (
                  <Node icon={MessageSquareQuote} tone="warning">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold">{t('changesRequested', { who: client })}</p>
                      {version.changeRequestedAt && (
                        <time className="text-muted text-xs" dateTime={version.changeRequestedAt}>
                          {stamp(version.changeRequestedAt)}
                        </time>
                      )}
                    </div>
                    <blockquote className="border-warning/30 bg-warning/10 mt-2 rounded-2xl border px-4 py-3 text-sm leading-relaxed whitespace-pre-line">
                      {version.changeRequest}
                    </blockquote>
                  </Node>
                )}
              </ol>
            </li>
          );
        })}
        {ending && (
          <Node icon={ending.icon} tone={ending.tone} last>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-semibold">{ending.text}</p>
              {history.closedAt && (
                <time className="text-muted text-xs" dateTime={history.closedAt}>
                  {stamp(history.closedAt)}
                </time>
              )}
            </div>
            {history.status === 'ACCEPTED' && history.bookingId && eventId && viewer === 'host' && (
              <Link
                href={`/events/${eventId}/bookings/${history.bookingId}`}
                className="text-brand-strong mt-1 inline-block text-sm font-semibold hover:underline"
              >
                {t('viewAgreement')}
              </Link>
            )}
          </Node>
        )}
      </ol>
    </details>
  );
}
