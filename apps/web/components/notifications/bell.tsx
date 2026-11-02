'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

/** In-app bell (P13-T03): unread count, refreshed on mount, on focus and every minute. */
export function BellButton({ initialUnread }: { initialUnread: number }) {
  const t = useTranslations('notifications');
  const [unread, setUnread] = useState(initialUnread);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/unread', { cache: 'no-store' });
      const body = (await response.json()) as { ok: boolean; data?: { unread?: number } };
      if (body.ok && typeof body.data?.unread === 'number') setUnread(body.data.unread);
    } catch {
      // offline or gone — the last known count stays
    }
  }, []);

  useEffect(() => {
    // First paint uses the server-rendered count; refresh on a timer and
    // whenever the tab regains focus (same pattern as live-refresh).
    const timer = setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  return (
    <Link
      href="/notifications"
      aria-label={t('bell', { count: unread })}
      className="text-text relative flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-focus"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path
          d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {unread > 0 && (
        <span className="bg-danger text-on-danger absolute top-0.5 right-0.5 rounded-full px-1.5 text-xs font-medium">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
