import { listMyOrgs } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { parseThemeChoice, THEME_COOKIE } from '@tiwa/ui/theme';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { SettingsForms } from './settings-forms.js';
import { SettingsTabs } from './settings-tabs.js';

/** ACC-04/ACC-05: profile, language, theme, notifications (P13), export, delete. */
export default async function SettingsPage() {
  const ctx = await requirePageUser('/settings');
  const t = await getTranslations('settings');
  const [user, orgs, store] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: ctx.actor.userId }, select: { name: true, phone: true } }),
    listMyOrgs(ctx.actor.userId),
    cookies(),
  ]);
  return (
    <AppFrame
      userId={ctx.actor.userId}
      active="settings"
      title={t('title')}
      sectionTabs={<SettingsTabs active="profile" showTeam={orgs.length > 0} />}
    >
      <SettingsForms
        // A phone sign-up's placeholder name is its number; don't prefill that as a name.
        name={user.name === user.phone ? '' : user.name}
        locale="en"
        theme={parseThemeChoice(store.get(THEME_COOKIE)?.value)}
      />
    </AppFrame>
  );
}
