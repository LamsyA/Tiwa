'use client';

import type { AppRole } from '@tiwa/ui';
import { DropdownMenu } from '@tiwa/ui';
import { Briefcase, LogOut, PartyPopper, Settings, Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { signOut } from '@/lib/auth-client.js';
import { ROLE_TONE } from './role-tone.js';

const ROLE_ICON: Record<AppRole, React.ComponentType<{ className?: string }>> = {
  host: PartyPopper,
  planner: Briefcase,
  vendor: Store,
};

export interface AccountInfo {
  name: string;
  role: AppRole;
  orgName: string | null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Colour-coded role pill: hosts, planners and vendors read differently at a glance. */
export function RoleBadge({ role, className = '' }: { role: AppRole; className?: string }) {
  const t = useTranslations('account');
  const Icon = ROLE_ICON[role];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{
        color: `color-mix(in oklab, ${ROLE_TONE[role]} 80%, var(--text))`,
        background: `color-mix(in oklab, ${ROLE_TONE[role]} 14%, transparent)`,
      }}
    >
      <Icon aria-hidden className="size-3" />
      {t(`role.${role}`)}
    </span>
  );
}

export function useSignOut() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return {
    busy,
    signOut: async () => {
      setBusy(true);
      try {
        await signOut();
      } finally {
        router.replace('/login');
        router.refresh();
      }
    },
  };
}

export function Avatar({ account, size = 'md' }: { account: AccountInfo; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-14 text-lg' : size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm';
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-[var(--bg)] ${box}`}
      style={{
        background: `linear-gradient(135deg, ${ROLE_TONE[account.role]}, color-mix(in oklab, ${ROLE_TONE[account.role]} 55%, black))`,
      }}
    >
      {initials(account.name)}
    </span>
  );
}

/** Sidebar footer / mobile header account button: who you are, as what, and sign out. */
export function AccountMenu({ account, compact = false }: { account: AccountInfo; compact?: boolean }) {
  const t = useTranslations('account');
  const router = useRouter();
  const { signOut: doSignOut } = useSignOut();
  return (
    <DropdownMenu
      label={account.orgName ? `${account.name} · ${account.orgName}` : account.name}
      align={compact ? 'end' : 'start'}
      trigger={
        compact ? (
          <button
            type="button"
            aria-label={t('menu')}
            className="flex size-10 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Avatar account={account} size="sm" />
          </button>
        ) : (
          <button
            type="button"
            className="hover:bg-surface flex w-full items-center gap-3 rounded-xl p-2 text-left transition focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Avatar account={account} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{account.name}</span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <RoleBadge role={account.role} />
                {account.orgName && <span className="text-muted truncate text-xs">{account.orgName}</span>}
              </span>
            </span>
          </button>
        )
      }
      items={[
        {
          label: t('settings'),
          icon: <Settings className="size-4" aria-hidden />,
          onSelect: () => router.push('/settings'),
        },
        {
          label: t('signOut'),
          icon: <LogOut className="size-4" aria-hidden />,
          onSelect: () => void doSignOut(),
        },
      ]}
    />
  );
}

export function SignOutButton() {
  const t = useTranslations('account');
  const { busy, signOut: doSignOut } = useSignOut();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void doSignOut()}
      className="border-danger/30 text-danger hover:bg-danger-soft flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 font-semibold transition disabled:opacity-60"
    >
      <LogOut aria-hidden className="size-4" />
      {busy ? t('signingOut') : t('signOut')}
    </button>
  );
}
