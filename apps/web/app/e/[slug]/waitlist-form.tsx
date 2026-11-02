'use client';

import { Button, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { waitlistAction } from './register/actions.js';

/** Sold-out fallback (TKT-08): join the waitlist with an email, no account. */
export function WaitlistForm({ slug }: { slug: string }) {
  const t = useTranslations('publicEvent');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [pending, start] = useTransition();
  if (joined) return <p className="text-sm">{t('waitlistJoined')}</p>;
  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-label={t('waitlistEmail')}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t('waitlistEmail')}
        inputMode="email"
      />
      <Input
        aria-label={t('waitlistName')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t('waitlistName')}
      />
      <Button
        disabled={pending || !email.trim()}
        onClick={() =>
          start(async () => {
            const result = await waitlistAction({
              eventSlug: slug,
              email: email.trim(),
              name: name.trim() || undefined,
              qty: 1,
            });
            if (result.ok) setJoined(true);
          })
        }
      >
        {t('joinWaitlist')}
      </Button>
    </div>
  );
}
