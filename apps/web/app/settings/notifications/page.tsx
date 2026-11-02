import { getPreferences, listMyOrgs } from '@tiwa/core';
import { getTranslations } from 'next-intl/server';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { SettingsTabs } from '../settings-tabs.js';
import { NotificationPrefs, type Channel } from './prefs.js';
import { PushSection } from './push-section.js';

/** Notification preferences + web push (P13-T03, MSG-15). */
export default async function NotificationSettingsPage() {
  const ctx = await requirePageUser('/settings/notifications');
  const t = await getTranslations('settings');
  const [orgs, prefs] = await Promise.all([listMyOrgs(ctx.actor.userId), getPreferences(ctx.actor)]);
  return (
    <AppFrame
      userId={ctx.actor.userId}
      active="settings"
      title={t('title')}
      sectionTabs={<SettingsTabs active="notifications" showTeam={orgs.length > 0} />}
    >
      <div className="flex flex-col gap-4 py-2">
        <PushSection />
        <NotificationPrefs
          types={Object.fromEntries(Object.entries(prefs.types).map(([type, def]) => [type, { urgent: def.urgent }]))}
          initial={{
            channels: prefs.channels as Record<string, Partial<Record<Channel, boolean>>>,
            quietStart: prefs.quietStart,
            quietEnd: prefs.quietEnd,
          }}
        />
      </div>
    </AppFrame>
  );
}
