import { getEventType } from '@tiwa/config';
import { listMyEvents, type EventListTab } from '@tiwa/core';
import { Badge, Card, DateText, EmptyState, ProgressRing, StatusPill, buttonClasses, cn } from '@tiwa/ui';
import { CalendarPlus, Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';

const TABS: { key: EventListTab; label: 'tabUpcoming' | 'tabPast' | 'tabDrafts' }[] = [
  { key: 'upcoming', label: 'tabUpcoming' },
  { key: 'past', label: 'tabPast' },
  { key: 'drafts', label: 'tabDrafts' },
];

/** P3-T06: Upcoming / Past / Drafts; drafts resume the wizard ("Continue setup"). */
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((candidate) => candidate.key === tabParam)?.key ?? 'upcoming';
  const ctx = await requirePageUser('/events');
  const t = await getTranslations('events');
  const events = await listMyEvents(ctx.actor.userId, tab);
  const empty = {
    upcoming: [t('list.emptyUpcomingTitle'), t('list.emptyUpcomingBody')],
    past: [t('list.emptyPastTitle'), t('list.emptyPastBody')],
    drafts: [t('list.emptyDraftsTitle'), t('list.emptyDraftsBody')],
  }[tab];

  return (
    <AppFrame userId={ctx.actor.userId} active="events" title={t('list.title')}>
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t('list.title')} className="bg-surface-2 inline-flex gap-1 rounded-md p-1">
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
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => {
              const label = getEventType(event.type)?.label;
              const href = event.status === 'DRAFT' ? `/events/new?id=${event.id}` : `/events/${event.id}`;
              return (
                <li key={event.id}>
                  <Card
                    interactive
                    href={href}
                    linkLabel={event.name}
                    className="flex h-full items-start gap-3 p-4"
                    style={{ borderTop: `4px solid ${event.themeColor ?? 'var(--brand)'}` }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap gap-2">
                        {label && <Badge>{label}</Badge>}
                        {event.status === 'CANCELLED' && <StatusPill tone="danger">{t('status.CANCELLED')}</StatusPill>}
                      </div>
                      <p className="truncate font-medium">{event.name}</p>
                      <p className="text-muted text-sm">
                        {event.startsAt ? (
                          <DateText value={event.startsAt} timeZone={event.timezone} />
                        ) : (
                          t('list.noDate')
                        )}
                      </p>
                      {event.status === 'DRAFT' ? (
                        <span className="text-brand-strong text-sm font-medium">{t('list.continueSetup')}</span>
                      ) : (
                        <span className="text-muted text-sm">
                          {t('list.progress', { done: event.progress.done, total: event.progress.total })}
                        </span>
                      )}
                    </div>
                    {event.status !== 'DRAFT' && (
                      <ProgressRing
                        value={event.progress.done}
                        max={Math.max(event.progress.total, 1)}
                        label={t('overview.progressLabel')}
                      />
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}
