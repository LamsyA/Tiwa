import { listInbox, type InboxFilter } from '@tiwa/core';
import { cn } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import type * as React from 'react';
import { AppFrame } from '@/components/app-frame.js';
import { ChatList } from '@/components/chat/chat-list.js';
import type { UserCtx } from '@/lib/action.js';

const FILTERS: InboxFilter[] = ['all', 'unread', 'enquiries', 'bookings', 'team'];

export function parseFilter(raw: string | undefined): InboxFilter {
  return FILTERS.find((filter) => filter === raw) ?? 'all';
}

/**
 * Inbox frame (Frontend.md §6.3): list + thread side by side from `lg`; on
 * phones the list and the thread are separate screens.
 */
export async function InboxLayout({
  ctx,
  filter,
  q,
  activeId,
  children,
}: {
  ctx: UserCtx;
  filter: InboxFilter;
  q?: string | undefined;
  activeId?: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations('inbox');
  const rows = await listInbox(ctx.actor, { filter, ...(q ? { search: q } : {}) });
  return (
    <AppFrame userId={ctx.actor.userId} active="inbox" title={t('title')}>
      <div className="border-border/80 bg-bg -mx-4 grid h-[calc(100dvh-196px)] min-h-[420px] overflow-hidden lg:mx-0 lg:h-[calc(100dvh-170px)] lg:grid-cols-[380px_minmax(0,1fr)] lg:rounded-2xl lg:border lg:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-16px_rgb(0_0_0/0.15)]">
        <div className={cn('border-border/70 min-h-0 lg:border-r', activeId && 'hidden lg:block')}>
          <ChatList rows={rows} filter={filter} {...(activeId ? { activeId } : {})} />
        </div>
        <div
          className={cn(
            'min-h-0 overflow-hidden',
            // Phones: an open conversation takes the whole screen (like WhatsApp), above the app bars,
            // with room for the iPhone home bar. From lg it sits beside the list as before.
            activeId &&
              'bg-bg fixed inset-0 z-50 h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:static lg:z-auto lg:h-auto lg:p-0',
            !activeId && 'tiwa-chat-wall hidden lg:flex lg:items-center lg:justify-center',
          )}
        >
          {children}
        </div>
      </div>
    </AppFrame>
  );
}
