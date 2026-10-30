'use client';

import { Banner, Button, ConfirmDialog, Switch } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { setInvitesEnabled } from './actions.js';

export function InvitesSwitch({ eventId, enabled }: { eventId: string; enabled: boolean }) {
  const t = useTranslations('events.invites');
  const te = useTranslations('events.invites.errors');
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function flip(next: boolean) {
    setBusy(true);
    setError(undefined);
    const result = await setInvitesEnabled({ eventId, enabled: next });
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

  if (!enabled) {
    return (
      <span className="inline-flex flex-col gap-2">
        {error && <Banner tone="danger">{error}</Banner>}
        <span>
          <Button loading={busy} onClick={() => void flip(true)}>
            {t('off.enable')}
          </Button>
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      {error && <Banner tone="danger">{error}</Banner>}
      <ConfirmDialog
        trigger={
          <span className="inline-flex items-center gap-2">
            <Switch checked disabled={busy} onCheckedChange={() => undefined} aria-label={t('on.disable')} />
          </span>
        }
        title={t('on.disable')}
        body={t('on.disableConfirm')}
        confirmLabel={t('on.disable')}
        onConfirm={() => void flip(false)}
      />
    </span>
  );
}
