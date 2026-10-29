import { listMembers, listMyOrgs } from '@tiwa/core';
import { EmptyState, buttonClasses } from '@tiwa/ui';
import { Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { SettingsTabs } from '../settings-tabs.js';
import { TeamManager } from './team-manager.js';

/** ACC-03: business team — invite by phone/email, roles OWNER/ADMIN/STAFF, remove, leave. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org: orgParam } = await searchParams;
  const ctx = await requirePageUser('/settings/team');
  const t = await getTranslations('settings');
  const orgs = await listMyOrgs(ctx.actor.userId);
  const current = orgs.find((row) => row.org.id === orgParam) ?? orgs[0];

  return (
    <AppFrame
      userId={ctx.actor.userId}
      active="settings"
      title={t('title')}
      sectionTabs={<SettingsTabs active="team" showTeam />}
    >
      {current ? (
        <TeamManager
          orgId={current.org.id}
          orgName={current.org.name}
          me={ctx.actor.userId}
          orgs={orgs.map((row) => ({ id: row.org.id, name: row.org.name }))}
          {...await listMembers(ctx.actor, current.org.id)}
        />
      ) : (
        <EmptyState
          icon={<Users className="size-8" aria-hidden />}
          title={t('team.noOrgTitle')}
          body={t('team.noOrgBody')}
          action={
            <Link href="/onboarding/role" className={buttonClasses()}>
              {t('team.noOrgAction')}
            </Link>
          }
        />
      )}
    </AppFrame>
  );
}
