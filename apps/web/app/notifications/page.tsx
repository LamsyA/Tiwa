import { listNotifications } from '@tiwa/core';
import { getTranslations } from 'next-intl/server';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { NotificationList } from './list.js';

/** In-app notification inbox (P13-T03, MSG-15): the bell lands here. */
export default async function NotificationsPage() {
  const ctx = await requirePageUser('/notifications');
  const t = await getTranslations('notifications');
  const { rows } = await listNotifications(ctx.actor, { take: 50 });
  return (
    <AppFrame userId={ctx.actor.userId} active="notifications" title={t('title')}>
      <div className="flex flex-col gap-4 py-2">
        <NotificationList rows={rows} />
      </div>
    </AppFrame>
  );
}
