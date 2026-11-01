'use client';

import { Tabs } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

/** Money tabs (UF-20 step 2) kept in the URL so each tab is linkable. */
export function MoneyTabbar({
  eventId,
  active,
  items,
}: {
  eventId: string;
  active: string;
  items: { value: string; label: string }[];
}) {
  const router = useRouter();
  const t = useTranslations('events.money');
  return (
    <Tabs
      ariaLabel={t('heading')}
      value={active}
      onValueChange={(value) => router.push(`/events/${eventId}/money?tab=${value}`)}
      items={items}
    />
  );
}
