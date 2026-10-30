'use client';

import { Banner, Button, Card, FieldShell, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { submitSharedRsvp } from './actions.js';

export function RsvpForm({ slug }: { slug: string }) {
  const t = useTranslations('shared.rsvp');
  const te = useTranslations('shared.rsvp.errors');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [done, setDone] = React.useState(false);

  if (done) {
    return (
      <Card className="p-4">
        <p role="status" className="font-medium">
          {t('done')}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          void submitSharedRsvp({ eventSlug: slug, name, ...(phone ? { phone } : {}) }).then((result) => {
            setBusy(false);
            if (!result.ok) {
              const key = result.fieldErrors ? Object.values(result.fieldErrors).flat()[0] : undefined;
              if (key === 'invalidPhone') setError(te('invalidPhone'));
              else if (result.code === 'RATE_LIMITED') setError(te('rateLimited'));
              else if (result.code === 'CONFLICT') setError(te('rsvpClosed'));
              else setError(te('generic'));
              return;
            }
            setDone(true);
          });
        }}
      >
        {error && <Banner tone="danger">{error}</Banner>}
        <FieldShell id="rsvp-name" label={t('name')}>
          {(describedBy) => (
            <Input
              id="rsvp-name"
              aria-describedby={describedBy}
              value={name}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
              required
            />
          )}
        </FieldShell>
        <FieldShell id="rsvp-phone" label={t('phone')}>
          {(describedBy) => (
            <Input
              id="rsvp-phone"
              aria-describedby={describedBy}
              value={phone}
              inputMode="tel"
              autoComplete="tel"
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </FieldShell>
        <div>
          <Button type="submit" loading={busy} fullWidth>
            {t('submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
