'use client';

import { Banner, Button } from '@tiwa/ui';
import {
  Bell,
  BellOff,
  Briefcase,
  CalendarClock,
  CheckCheck,
  Mail,
  MessageCircle,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { markAllAction, markReadAction } from './actions.js';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  readAt: string | null;
  createdAt: string;
}

/** Icon by type family ("booking.confirmed" → booking). */
const ICONS: Record<string, LucideIcon> = {
  chat: MessageCircle,
  booking: Briefcase,
  quote: Briefcase,
  payment: Wallet,
  money: Wallet,
  day: CalendarClock,
  invite: Mail,
  rsvp: Mail,
  guest: Mail,
};

function iconFor(type: string): LucideIcon {
  return ICONS[type.split('.')[0] ?? ''] ?? Bell;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** In-app inbox (P13-T03): newest first, grouped Today / Earlier; opening an item marks it read. */
export function NotificationList({ rows, now }: { rows: NotificationRow[]; now: string }) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const today = new Date(now);
  const unread = rows.filter((row) => !row.readAt).length;
  const groups = [
    { key: 'today', rows: rows.filter((row) => sameDay(new Date(row.createdAt), today)) },
    { key: 'earlier', rows: rows.filter((row) => !sameDay(new Date(row.createdAt), today)) },
  ].filter((group) => group.rows.length > 0);

  const open = (row: NotificationRow) => {
    setError(false);
    start(async () => {
      if (!row.readAt) {
        const result = await markReadAction({ notificationId: row.id });
        if (!result.ok) setError(true);
      }
      router.push(row.url);
    });
  };

  if (rows.length === 0) {
    return (
      <div className="border-border/70 bg-surface flex flex-col items-center gap-3 rounded-3xl border border-dashed px-6 py-16 text-center">
        <span className="bg-brand-soft text-brand-strong flex size-14 items-center justify-center rounded-2xl">
          <BellOff aria-hidden className="size-6" />
        </span>
        <p className="font-display text-lg font-bold">{t('empty')}</p>
        <p className="text-muted max-w-sm text-sm">{t('emptyBody')}</p>
        <Link href="/settings/notifications" className="text-brand-strong text-sm font-semibold hover:underline">
          {t('manage')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {error && <Banner tone="danger">{t('saveFailed')}</Banner>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-sm">{t('unreadCount', { count: unread })}</p>
        <div className="flex items-center gap-2">
          <Link href="/settings/notifications" className="text-muted hover:text-text text-sm font-medium">
            {t('manage')}
          </Link>
          {unread > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              className="rounded-full"
              onClick={() =>
                start(async () => {
                  const result = await markAllAction({});
                  if (!result.ok) setError(true);
                  else router.refresh();
                })
              }
            >
              <CheckCheck aria-hidden className="size-4" />
              {t('markAll')}
            </Button>
          )}
        </div>
      </div>
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`n-${group.key}`} className="flex flex-col gap-2">
          <h2 id={`n-${group.key}`} className="text-muted px-1 text-xs font-semibold tracking-wide uppercase">
            {t(`group.${group.key}`)}
          </h2>
          <ul className="border-border/70 bg-surface divide-border/60 divide-y overflow-hidden rounded-3xl border">
            {group.rows.map((row) => {
              const Icon = iconFor(row.type);
              const created = new Date(row.createdAt);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => open(row)}
                    className={`hover:bg-surface-2 flex w-full items-start gap-3 px-4 py-4 text-left transition sm:px-5 ${
                      row.readAt ? '' : 'bg-brand-soft/25'
                    }`}
                  >
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${
                        row.readAt ? 'bg-surface-2 text-muted' : 'bg-brand-soft text-brand-strong'
                      }`}
                    >
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block ${row.readAt ? 'font-medium' : 'font-semibold'}`}>{row.title}</span>
                      <span className="text-muted line-clamp-2 block text-sm">{row.body}</span>
                      <span className="text-muted mt-1 block text-xs">
                        {group.key === 'today'
                          ? created.toLocaleTimeString([], { timeStyle: 'short' })
                          : created.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </span>
                    {!row.readAt && (
                      <span aria-label={t('unread')} className="bg-brand mt-2 size-2.5 shrink-0 rounded-full" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
