import { safeNextPath } from '@tiwa/core';
import { GuestShell } from '@tiwa/ui';
import { Briefcase, PartyPopper, Store } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

const ROLES = [
  { key: 'Host', icon: PartyPopper, href: '/onboarding/profile' },
  { key: 'Planner', icon: Briefcase, href: '/onboarding/business?role=planner' },
  { key: 'Vendor', icon: Store, href: '/onboarding/business?role=vendor' },
] as const;

export default async function RolePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const keep = safeNextPath(next, '');
  const t = await getTranslations('onboarding');
  return (
    <GuestShell title={t('roleTitle')}>
      <div className="flex flex-col gap-3">
        {ROLES.map((role) => {
          const href = keep
            ? `${role.href}${role.href.includes('?') ? '&' : '?'}next=${encodeURIComponent(keep)}`
            : role.href;
          return (
            <Link
              key={role.key}
              href={href}
              className="border-border bg-surface shadow-1 duration-fast flex min-h-11 items-center gap-4 rounded-lg border p-4 transition-transform ease-out active:scale-[0.99]"
            >
              <span
                aria-hidden
                className="bg-brand-soft text-brand-strong flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <role.icon className="size-5" />
              </span>
              <span>
                <span className="block font-medium">{t(`role${role.key}Title`)}</span>
                <span className="text-muted block text-sm">{t(`role${role.key}Body`)}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </GuestShell>
  );
}
