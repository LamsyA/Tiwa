'use client';

import type { InboxFilter, InboxRow } from '@tiwa/core';
import { Avatar, EmptyState, Input, RelativeTime, cn } from '@tiwa/ui';
import { BellOff, MessageCircle, Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useInboxStream } from '@/hooks/use-chat.js';

const FILTERS: {
  key: InboxFilter;
  label: 'filterAll' | 'filterUnread' | 'filterEnquiries' | 'filterBookings' | 'filterTeam';
}[] = [
  { key: 'all', label: 'filterAll' },
  { key: 'unread', label: 'filterUnread' },
  { key: 'enquiries', label: 'filterEnquiries' },
  { key: 'bookings', label: 'filterBookings' },
  { key: 'team', label: 'filterTeam' },
];

/** Conversation list with filter chips and search (Frontend.md §6.3 Inbox). Refreshes on any chat event. */
export function ChatList({ rows, filter, activeId }: { rows: InboxRow[]; filter: InboxFilter; activeId?: string }) {
  const t = useTranslations('inbox');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = React.useState(params.get('q') ?? '');

  const refresh = React.useCallback(() => router.refresh(), [router]);
  useInboxStream(
    React.useCallback(
      (event) => {
        if (event.type !== 'typing') refresh();
      },
      [refresh],
    ),
    refresh,
  );

  const href = (next: Partial<{ filter: InboxFilter; q: string }>) => {
    const search = new URLSearchParams(params.toString());
    if (next.filter !== undefined) search.set('filter', next.filter);
    if (next.q !== undefined) {
      if (next.q) search.set('q', next.q);
      else search.delete('q');
    }
    return `${pathname}?${search.toString()}`;
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <form
        role="search"
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          router.replace(href({ q: query.trim() }));
        }}
      >
        <Search
          aria-hidden
          className="text-muted pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
        />
        <Input
          type="search"
          aria-label={t('search')}
          placeholder={t('search')}
          className="pl-10"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>
      <nav aria-label={t('filters')} className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={href({ filter: item.key })}
            aria-current={filter === item.key ? 'page' : undefined}
            className={cn(
              'flex h-9 shrink-0 items-center rounded-full border px-3 text-sm font-medium',
              filter === item.key
                ? 'border-brand-strong bg-brand-soft text-text'
                : 'border-border bg-surface text-muted',
            )}
          >
            {t(item.label)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="size-8" aria-hidden />}
          title={filter === 'all' && !query ? t('emptyTitle') : t('emptyFiltered')}
          body={filter === 'all' && !query ? t('emptyBody') : ''}
        />
      ) : (
        <ul className="divide-border flex-1 divide-y overflow-y-auto">
          {rows.map((row) => {
            const title = row.title || (row.kind === 'EVENT' ? t('team') : '…');
            return (
              <li key={row.threadId}>
                <Link
                  href={`/inbox/${row.threadId}${params.toString() ? `?${params.toString()}` : ''}`}
                  aria-current={activeId === row.threadId ? 'page' : undefined}
                  className={cn(
                    'hover:bg-surface-2 flex min-h-[64px] items-center gap-3 px-2 py-3',
                    activeId === row.threadId && 'bg-brand-soft',
                  )}
                >
                  {row.kind === 'EVENT' ? (
                    <span
                      aria-hidden
                      className="bg-surface-2 flex size-10 shrink-0 items-center justify-center rounded-full"
                    >
                      <Users className="size-5" />
                    </span>
                  ) : (
                    <Avatar name={title} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn('truncate', row.unread > 0 ? 'font-semibold' : 'font-medium')}>{title}</span>
                      {row.muted && <BellOff aria-hidden className="text-muted size-4 shrink-0" />}
                      {row.lastMessage && (
                        <span className="text-muted ml-auto shrink-0 text-xs">
                          <RelativeTime value={row.lastMessage.at} />
                        </span>
                      )}
                    </span>
                    {row.eventName && row.kind !== 'EVENT' && (
                      <span className="text-muted block truncate text-xs">
                        {row.context === 'GUEST_ENQUIRY'
                          ? t('metAt', { event: row.eventName })
                          : t('about', { event: row.eventName })}
                      </span>
                    )}
                    <span className="flex items-center gap-2">
                      <span className="text-muted block min-w-0 flex-1 truncate text-sm">
                        {row.lastMessage
                          ? row.lastMessage.deleted
                            ? t('deleted')
                            : `${row.lastMessage.mine ? `${t('you')}: ` : ''}${row.lastMessage.body || (row.lastMessage.kind === 'IMAGE' ? t('photo') : row.lastMessage.kind === 'FILE' ? t('file') : '')}`
                          : ''}
                      </span>
                      {row.unread > 0 && (
                        <span
                          className="bg-brand-strong text-on-brand shrink-0 rounded-full px-2 text-xs font-medium"
                          aria-label={t('unreadCount', { count: row.unread })}
                        >
                          {row.unread > 99 ? '99+' : row.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
