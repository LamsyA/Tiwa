'use client';

import type { BusinessLookupHit } from '@tiwa/core';
import { Input, ResponsiveDialog } from '@tiwa/ui';
import { AtSign, BadgeCheck, PenSquare, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { MessageBusiness } from './message-business.js';

/** Inbox "New chat": find a vendor or planner by name or @handle and message them right here. */
export function NewChat() {
  const t = useTranslations('inbox');
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<BusinessLookupHit[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (q.trim().replace(/^@/, '').length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/chat/find?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await response.json()) as { hits: BusinessLookupHit[] };
        setHits(data.hits);
      } catch {
        /* aborted or offline: keep the last results */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('newChat')}
        className="bg-brand-strong text-on-brand flex size-10 shrink-0 items-center justify-center rounded-full shadow-[var(--shadow-1)] transition hover:brightness-110"
      >
        <PenSquare aria-hidden className="size-4" />
      </button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t('newChat')} description={t('newChatBody')}>
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search
              aria-hidden
              className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            />
            <Input
              autoFocus
              type="search"
              aria-label={t('newChatSearch')}
              placeholder={t('newChatSearch')}
              className="h-12 rounded-xl pl-10"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          {q.trim().length >= 2 && !loading && hits.length === 0 && (
            <p className="text-muted py-6 text-center text-sm">{t('newChatEmpty', { q: q.trim() })}</p>
          )}
          {q.trim().length < 2 && (
            <p className="text-muted flex items-center gap-2 text-sm">
              <AtSign aria-hidden className="size-4" />
              {t('newChatHint')}
            </p>
          )}
          <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            {(q.trim().replace(/^@/, '').length < 2 ? [] : hits).map((hit) => (
              <li key={hit.orgId} className="hover:bg-surface-2 flex items-center gap-3 rounded-xl p-2.5">
                <span className="bg-brand-soft text-brand-strong flex size-11 shrink-0 items-center justify-center rounded-full font-bold">
                  {hit.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 font-semibold">
                    <span className="truncate">{hit.name}</span>
                    {hit.verified && <BadgeCheck aria-hidden className="text-brand-strong size-4 shrink-0" />}
                  </span>
                  <span className="text-muted block truncate text-xs">
                    @{hit.slug} · {hit.kind === 'PLANNER' ? t('kindPlanner') : (hit.categoryLabel ?? t('kindVendor'))}
                    {hit.city ? ` · ${hit.city}` : ''}
                  </span>
                </span>
                <MessageBusiness orgId={hit.orgId} orgName={hit.name} variant="secondary" />
              </li>
            ))}
          </ul>
        </div>
      </ResponsiveDialog>
    </>
  );
}
