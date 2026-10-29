'use client';

import { Button, EmptyState, GuestShell } from '@tiwa/ui';
import { useTranslations } from 'next-intl';

export default function OnboardingError({ reset }: { reset: () => void }) {
  const t = useTranslations('errors');
  return (
    <GuestShell title={t('genericTitle')}>
      <EmptyState
        title={t('genericTitle')}
        body={t('genericBody')}
        action={<Button onClick={reset}>{t('retry')}</Button>}
      />
    </GuestShell>
  );
}
