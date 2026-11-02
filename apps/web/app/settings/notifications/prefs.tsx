'use client';

import { Button, Card, Input } from '@tiwa/ui';
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
      if (!result.ok) setError('saveFailed');
      else setSaved(true);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-danger text-sm">{error}</p>}
      {saved && <p className="text-sm">{t('saved')}</p>}
      {Object.keys(props.types).map((type) => (
        <Card key={type} className="flex flex-col gap-2 p-4 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{prettyType(type)}</span>
            {props.types[type]?.urgent && <span className="text-muted text-xs">{t('urgentAlways')}</span>}
          </div>
          <div className="flex flex-wrap gap-3">
            {CHANNELS.map((channel) => (
              <label key={channel} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={channels[type]?.[channel] ?? false}
                  onChange={(event) =>
                    setChannels((prev) => ({ ...prev, [type]: { ...prev[type], [channel]: event.target.checked } }))
                  }
                />
                {t(`channels.${channel}`)}
              </label>
            ))}
          </div>
        </Card>
      ))}
      <Card className="flex flex-col gap-2 p-4 text-sm">
        <span className="font-medium">{t('quietHours')}</span>
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
      </Card>
      <div>
        <Button disabled={pending} onClick={save}>
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
