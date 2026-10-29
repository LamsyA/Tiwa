import { cn } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

/** Settings sections as links (each is its own route, so back/forward and deep links work). */
export async function SettingsTabs({ active, showTeam }: { active: 'profile' | 'team'; showTeam: boolean }) {
  const t = await getTranslations('settings');
  const tabs = [
    { key: 'profile', href: '/settings', label: t('tabProfile') },
    ...(showTeam ? [{ key: 'team', href: '/settings/team', label: t('tabTeam') }] : []),
  ];
  return (
    <nav aria-label={t('title')} className="flex gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? 'page' : undefined}
          className={cn(
            'flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium',
            active === tab.key ? 'border-brand-strong text-text' : 'text-muted hover:text-text border-transparent',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
