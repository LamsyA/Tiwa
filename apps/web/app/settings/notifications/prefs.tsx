'use client';

import { Banner, Button, Input } from '@tiwa/ui';
import { Moon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { savePreferencesAction } from './actions.js';

export type Channel = 'inApp' | 'push' | 'email' | 'sms' | 'whatsapp';

const CHANNELS: Channel[] = ['inApp', 'push', 'email', 'sms', 'whatsapp'];

function prettyType(type: string): string {
  return type
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ');
}

function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function toClock(minutes: number | null): string {
  if (minutes === null) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Notification preferences matrix + quiet hours (P13-T03, MSG-15). */
export function NotificationPrefs(props: {
  types: Record<string, { urgent: boolean }>;
  initial: {
    channels: Record<string, Partial<Record<Channel, boolean>>>;
    quietStart: number | null;
    quietEnd: number | null;
  };
}) {
  const t = useTranslations('notifications');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [channels, setChannels] = useState(props.initial.channels);
  const [quietStart, setQuietStart] = useState(toClock(props.initial.quietStart));
  const [quietEnd, setQuietEnd] = useState(toClock(props.initial.quietEnd));

  const save = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await savePreferencesAction({
        channels,
        quietStart: quietStart ? toMinutes(quietStart) : null,
        quietEnd: quietEnd ? toMinutes(quietEnd) : null,
      });
      if (!result.ok) setError(t('saveFailed'));
      else setSaved(true);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {error && <Banner tone="danger">{error}</Banner>}
      {saved && <Banner tone="info">{t('saved')}</Banner>}
      <div className="border-border/70 bg-surface divide-border/60 divide-y overflow-hidden rounded-3xl border">
        {Object.keys(props.types).map((type) => (
          <div key={type} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            <div className="min-w-0 flex-1">
              <span className="block font-semibold">{prettyType(type)}</span>
              {props.types[type]?.urgent && (
                <span className="text-warning text-xs font-medium">{t('urgentAlways')}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((channel) => {
                const on = channels[type]?.[channel] ?? false;
                return (
                  <label
                    key={channel}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? 'border-brand/50 bg-brand-soft text-brand-strong'
                        : 'border-border/70 text-muted hover:text-text'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--brand)] size-3.5"
                      checked={on}
                      onChange={(event) =>
                        setChannels((prev) => ({ ...prev, [type]: { ...prev[type], [channel]: event.target.checked } }))
                      }
                    />
                    {t(`channels.${channel}`)}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-5">
        <span className="flex items-center gap-2 font-semibold">
          <Moon aria-hidden className="text-muted size-4" />
          {t('quietHours')}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={t('quietStart')}
            type="time"
            value={quietStart}
            onChange={(event) => setQuietStart(event.target.value)}
            className="w-36"
          />
          <span className="text-muted">–</span>
          <Input
            aria-label={t('quietEnd')}
            type="time"
            value={quietEnd}
            onChange={(event) => setQuietEnd(event.target.value)}
            className="w-36"
          />
        </div>
        <p className="text-muted text-xs">{t('quietNote')}</p>
      </div>
      <div>
        <Button disabled={pending} loading={pending} onClick={save} className="rounded-full px-6">
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
