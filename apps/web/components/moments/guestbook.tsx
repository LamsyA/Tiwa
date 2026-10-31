'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@tiwa/ui';

export interface GuestbookMessage {
  id: string;
  name: string | null;
  body: string;
  createdAt: string;
}

/**
 * Public guestbook wall (P5-T11, MOM-14): newest first, name + message form.
 * Posts revalidate through the `gallery:refresh` bus like the grid.
 */
export function GuestbookPanel({
  code,
  access,
  initialMessages,
}: {
  code: string;
  access: string;
  initialMessages: GuestbookMessage[];
}) {
  const t = useTranslations('gallery');
  const [messages, setMessages] = React.useState(initialMessages);
  const [name, setName] = React.useState('');
  const [body, setBody] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const reload = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (access) params.set('access', access);
      const response = await fetch(`/api/gallery/${code}/guestbook${params.size > 0 ? `?${params}` : ''}`);
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: { messages?: GuestbookMessage[] };
      } | null;
      if (response.ok && payload?.ok && Array.isArray(payload.data?.messages)) setMessages(payload.data.messages);
    } catch {
      // Offline — keep the server-rendered wall.
    }
  }, [code, access]);

  React.useEffect(() => {
    const onRefresh = () => void reload();
    window.addEventListener('gallery:refresh', onRefresh);
    return () => window.removeEventListener('gallery:refresh', onRefresh);
  }, [reload]);

  const sign = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/gallery/${code}/guestbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, body: text, ...(access ? { access } : {}) }),
      });
      if (response.ok) {
        setBody('');
        await reload();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <form onSubmit={sign} className="border-border bg-surface flex flex-col gap-2 rounded-md border p-3">
        <div>
          <label htmlFor="guestbook-name" className="mb-1 block text-sm font-medium">
            {t('guestName')}
          </label>
          <input
            id="guestbook-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('guestNamePlaceholder')}
            autoComplete="given-name"
            maxLength={80}
            className="border-border bg-bg text-text h-11 w-full rounded-md border px-3 text-base"
          />
        </div>
        <div>
          <label htmlFor="guestbook-body" className="mb-1 block text-sm font-medium">
            {t('guestMessage')}
          </label>
          <textarea
            id="guestbook-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('guestMessagePlaceholder')}
            maxLength={500}
            rows={3}
            required
            className="border-border bg-bg text-text w-full rounded-md border px-3 py-2 text-base"
          />
        </div>
        <button
          type="submit"
          disabled={saving || body.trim().length === 0}
          className="bg-brand-strong text-on-brand rounded-md py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? t('signingIn') : t('signButton')}
        </button>
      </form>
      <ul className="mt-3 flex flex-col gap-2">
        {messages.map((message) => (
          <li key={message.id} className="border-border rounded-md border p-3">
            <p className="text-sm">{message.body}</p>
            <p className="text-muted mt-1 text-xs">
              {message.name ?? '—'} ·{' '}
              {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(message.createdAt))}
            </p>
          </li>
        ))}
      </ul>
      {messages.length === 0 && <EmptyState title={t('guestbookTitle')} body={t('guestbookEmpty')} />}
    </div>
  );
}
