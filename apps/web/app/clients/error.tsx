'use client';

import { EmptyState } from '@tiwa/ui';
import { useTranslations } from 'next-intl';

export default function Error() {
  const t = useTranslations('errors');
  return <EmptyState title={t('genericTitle')} body={t('genericBody')} />;
}
