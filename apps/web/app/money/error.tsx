'use client';

import { Button, EmptyState } from '@tiwa/ui';
import { useTranslations } from 'next-intl';

export default function RouteError({ reset }: { reset: () => void }) {
  const t = useTranslations('errors');
  return (
    <div className="p-4">
      <EmptyState
        title={t('genericTitle')}
        body={t('genericBody')}
        action={<Button onClick={reset}>{t('retry')}</Button>}
      />
    </div>
  );
}
