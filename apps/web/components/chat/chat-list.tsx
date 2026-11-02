'use client';

import type { InboxFilter, InboxRow } from '@tiwa/core';
import { Avatar, EmptyState, Input, RelativeTime, cn } from '@tiwa/ui';
import { BellOff, MessageCircle, Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { NewChat } from './new-chat.js';
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
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pt-3">
        <form
          role="search"
          className="relative min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            router.replace(href({ q: query.trim() }));
          }}
        >
          <Search
            aria-hidden
            className="text-muted pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            aria-label={t('search')}
            placeholder={t('search')}
            className="h-10 rounded-xl border-transparent bg-[var(--chat-panel)] pl-11 shadow-none focus:border-transparent"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        <NewChat />
      </div>
      <nav aria-label={t('filters')} className="scrollbar-none flex gap-2 overflow-x-auto px-3 py-3">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={href({ filter: item.key })}
            aria-current={filter === item.key ? 'page' : undefined}
            className={cn(
              'flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-medium transition-colors',
              filter === item.key
                ? 'bg-[color-mix(in_oklab,var(--chat-accent)_18%,transparent)] text-[var(--chat-accent)]'
                : 'text-muted bg-[var(--chat-panel)] hover:text-text',
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
        <ul className="flex-1 overflow-y-auto">
          {rows.map((row) => {
            const title = row.title || (row.kind === 'EVENT' ? t('team') : '…');
            return (
              <li key={row.threadId}>
                <Link
                  href={`/inbox/${row.threadId}${params.toString() ? `?${params.toString()}` : ''}`}
                  aria-current={activeId === row.threadId ? 'page' : undefined}
                  className={cn(
                    'group flex min-h-[72px] items-center gap-3 px-3 transition-colors hover:bg-[var(--chat-panel)]',
                    activeId === row.threadId && 'bg-[var(--chat-panel)]',
                  )}
                >
                  {row.kind === 'EVENT' ? (
                    <span
                      aria-hidden
                      className="bg-brand-soft text-brand-strong flex size-12 shrink-0 items-center justify-center rounded-full"
                    >
                      <Users className="size-5" />
                    </span>
                  ) : (
                    <Avatar name={title} />
                  )}
                  <span className="border-border/60 flex min-h-[72px] min-w-0 flex-1 flex-col justify-center border-b py-2.5">
                    <span className="flex items-center gap-2">
                      <span className={cn('truncate', row.unread > 0 ? 'font-semibold' : 'font-medium')}>{title}</span>
                      {row.muted && <BellOff aria-hidden className="text-muted size-4 shrink-0" />}
                      {row.lastMessage && (
                        <span
                          className={cn(
                            'ml-auto shrink-0 text-xs',
                            row.unread > 0 ? 'font-medium text-[var(--chat-accent)]' : 'text-muted',
                          )}
                        >
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
                          className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--chat-accent)] px-1.5 text-[11px] font-semibold text-white"
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
