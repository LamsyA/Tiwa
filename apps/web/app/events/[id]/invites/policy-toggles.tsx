'use client';

import { Banner, Card, Switch } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { setForwarding, setReminders } from './actions.js';

/** Invitation switches: automatic reminders (max 2) + forwarding permission (GST-16, P4-T11). */
export function PolicyToggles({
  eventId,
  remindersOn,
  forwardingOn,
}: {
  eventId: string;
  remindersOn: boolean;
  forwardingOn: boolean;
}) {
  const t = useTranslations('events.invites.policies');
  const te = useTranslations('events.invites.errors');
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function flip(which: 'reminders' | 'forwarding', next: boolean) {
    setBusy(true);
    setError(undefined);
    const result =
      which === 'reminders'
        ? await setReminders({ eventId, enabled: next })
        : await setForwarding({ eventId, enabled: next });
    setBusy(false);
    if (!result.ok) {
      try {
        setError(te(result.code));
      } catch {
        setError(te('generic'));
      }
      return;
    }
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h3 className="font-medium">{t('title')}</h3>
      {error && <Banner tone="danger">{error}</Banner>}
      <label className="flex cursor-pointer items-start gap-2">
        <Switch
          checked={remindersOn}
          disabled={busy}
          onCheckedChange={(next) => void flip('reminders', next)}
          aria-label={t('reminders')}
        />
        <span>
          <span className="block text-sm font-medium">{t('reminders')}</span>
          <span className="text-muted block text-sm">{t('remindersHint')}</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2">
        <Switch
          checked={forwardingOn}
          disabled={busy}
          onCheckedChange={(next) => void flip('forwarding', next)}
          aria-label={t('forwarding')}
        />
        <span>
          <span className="block text-sm font-medium">{t('forwarding')}</span>
          <span className="text-muted block text-sm">{t('forwardingHint')}</span>
        </span>
      </label>
    </Card>
  );
}
