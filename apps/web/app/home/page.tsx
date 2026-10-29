import { EmptyState, buttonClasses } from '@tiwa/ui';
import { CalendarPlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';

/** Signed-in landing (UF-02 default). The real dashboard arrives with events in P3. */
export default async function HomePage() {
  const ctx = await requirePageUser('/home');
  const t = await getTranslations('home');
  return (
    <AppFrame userId={ctx.actor.userId} active="home" title={t('title')}>
      <EmptyState
        icon={<CalendarPlus className="size-8" aria-hidden />}
        title={t('emptyTitle')}
        body={t('emptyBody')}
        action={
          <Link href="/events/new" className={buttonClasses()}>
            {t('createEvent')}
          </Link>
        }
      />
    </AppFrame>
  );
}
