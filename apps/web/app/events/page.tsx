import { eventTypeLabel } from '@tiwa/config';
import { listMyEvents, type EventListTab } from '@tiwa/core';
import { EmptyState, StatusPill, buttonClasses, cn } from '@tiwa/ui';
import { ArrowUpRight, CalendarPlus, Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';

const TABS: { key: EventListTab; label: 'tabUpcoming' | 'tabPast' | 'tabDrafts' }[] = [
  { key: 'upcoming', label: 'tabUpcoming' },
  { key: 'past', label: 'tabPast' },
  { key: 'drafts', label: 'tabDrafts' },
];

/** Whole days from now until `date` (negative once it has passed). */
function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

/** P3-T06: Upcoming / Past / Drafts; drafts resume the wizard ("Continue setup"). */
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((candidate) => candidate.key === tabParam)?.key ?? 'upcoming';
  const ctx = await requirePageUser('/events');
  const t = await getTranslations('events');
  const events = await listMyEvents(ctx.actor.userId, tab);
  // Short-lived signed links for cover photos (private bucket).
  const covers = new Map(
    await Promise.all(
      events.map(
        async (event) =>
          [
            event.id,
            event.coverKey
              ? await privateStorage()
                  .getSignedUrl(event.coverKey, 3600)
                  .catch(() => null)
              : null,
          ] as const,
      ),
    ),
  );
  const empty = {
    upcoming: [t('list.emptyUpcomingTitle'), t('list.emptyUpcomingBody')],
    past: [t('list.emptyPastTitle'), t('list.emptyPastBody')],
    drafts: [t('list.emptyDraftsTitle'), t('list.emptyDraftsBody')],
  }[tab];

  return (
    <AppFrame userId={ctx.actor.userId} active="events" title={t('list.title')}>
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t('list.title')} className="bg-surface-2 inline-flex gap-1 rounded-xl p-1">
            {TABS.map((item) => (
              <Link
                key={item.key}
                href={`/events?tab=${item.key}`}
                aria-current={tab === item.key ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center rounded-[6px] px-3 text-sm font-medium',
                  tab === item.key ? 'bg-bg text-text shadow-1' : 'text-muted hover:text-text',
                )}
              >
                {t(`list.${item.label}`)}
              </Link>
            ))}
          </nav>
          <Link href="/events/new" className={buttonClasses()}>
            <Plus aria-hidden className="size-5" />
            {t('list.newEvent')}
          </Link>
        </div>

        {events.length === 0 ? (
          <EmptyState
            icon={<CalendarPlus className="size-8" aria-hidden />}
            title={empty[0] ?? ''}
            body={empty[1] ?? ''}
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => {
              const label = eventTypeLabel(event);
              const href = event.status === 'DRAFT' ? `/events/new?id=${event.id}` : `/events/${event.id}`;
              const cover = covers.get(event.id) ?? null;
              const theme = event.themeColor ?? '#b83a17';
              const start = event.startsAt ? new Date(event.startsAt) : null;
              const parts = start
                ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: event.timezone })
                    .formatToParts(start)
                    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {})
                : null;
              const days = start ? daysUntil(start) : null;
              const pct = event.progress.total > 0 ? Math.round((event.progress.done / event.progress.total) * 100) : 0;
              return (
                <li key={event.id}>
                  <Link
                    href={href}
                    aria-label={event.name}
                    className="group border-border/70 bg-surface flex h-full flex-col overflow-hidden rounded-3xl border shadow-[var(--shadow-1)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-2)]"
                  >
                    <div
                      className="relative aspect-[16/9] overflow-hidden"
                      style={{
                        background: `radial-gradient(120% 120% at 100% 0%, ${theme}cc 0%, ${theme} 45%, #1c1917 100%)`,
                      }}
                    >
                      {cover && (
                        <img
                          src={cover}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-105"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      {parts && (
                        <div className="absolute top-3 left-3 flex flex-col items-center rounded-2xl bg-white/95 px-3 py-1.5 text-[#1c1917] shadow-sm backdrop-blur">
                          <span className="text-[10px] font-bold tracking-[0.14em] text-[#b83a17] uppercase">
                            {parts.month}
                          </span>
                          <span className="font-display text-xl leading-none font-bold">{parts.day}</span>
                        </div>
                      )}
                      <div className="absolute top-3 right-3 flex flex-wrap justify-end gap-1.5">
                        {event.status === 'DRAFT' && (
                          <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-[#1c1917]">
                            {t('list.draft')}
                          </span>
                        )}
                        {event.status === 'CANCELLED' && <StatusPill tone="danger">{t('status.CANCELLED')}</StatusPill>}
                        {event.status === 'ACTIVE' && days !== null && days >= 0 && (
                          <span className="rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
                            {days === 0 ? t('list.today') : t('list.inDays', { count: days })}
                          </span>
                        )}
                      </div>
                      <div className="absolute inset-x-4 bottom-3 text-white">
                        {label && (
                          <p className="text-xs font-semibold tracking-[0.12em] text-white/80 uppercase">{label}</p>
                        )}
                        <p className="font-display truncate text-xl font-bold tracking-tight">{event.name}</p>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted truncate">
                          {start
                            ? new Intl.DateTimeFormat('en', {
                                weekday: 'short',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                timeZone: event.timezone,
                              }).format(start)
                            : t('list.noDate')}
                        </span>
                        <span className="bg-surface-2 text-muted shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                          {t(`list.role.${event.role}` as 'list.role.HOST')}
                        </span>
                      </div>
                      {event.status === 'DRAFT' ? (
                        <span className="text-brand-strong mt-auto inline-flex items-center gap-1 text-sm font-semibold">
                          {t('list.continueSetup')}
                          <ArrowUpRight
                            aria-hidden
                            className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          />
                        </span>
                      ) : (
                        <div className="mt-auto flex flex-col gap-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted">
                              {t('list.progress', { done: event.progress.done, total: event.progress.total })}
                            </span>
                            <span className="font-semibold tabular-nums">{pct}%</span>
                          </div>
                          <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: theme }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}
