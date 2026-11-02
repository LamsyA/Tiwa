import { getFlagsFor, listMyOrgs, unreadTotal } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { AppShell, type AppRole } from '@tiwa/ui';
import type * as React from 'react';
import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { loadUserRow } from '@/lib/ctx.js';
import { AccountMenu, type AccountInfo } from './account-menu.js';
import { CommandPalette } from './command-palette.js';
import { FlagsProvider } from './flags.js';

/** Navigation follows the user's business, if any (Frontend.md §5.4); everyone else gets the host frame. */
export async function roleForUser(userId: string): Promise<AppRole> {
  const orgs = await listMyOrgs(userId);
  if (orgs.some((row) => row.org.kind === 'PLANNER')) return 'planner';
  if (orgs.some((row) => row.org.kind === 'VENDOR')) return 'vendor';
  return 'host';
}

function roleForOrgs(orgs: Awaited<ReturnType<typeof listMyOrgs>>): AppRole {
  if (orgs.some((row) => row.org.kind === 'PLANNER')) return 'planner';
  if (orgs.some((row) => row.org.kind === 'VENDOR')) return 'vendor';
  return 'host';
}

/** The demo/nav org list. TTL-cached (30s): cosmetic nav role; membership
 * changes reach the nav within 30s and every permission check still reads
 * live rows (loadEventAccess is never cached). */
const ORGS_TTL_MS = 30_000;
const orgsCache = new Map<string, { at: number; list: Awaited<ReturnType<typeof listMyOrgs>> }>();
export function clearOrgsCache(userId?: string): void {
  if (userId) orgsCache.delete(userId);
  else orgsCache.clear();
}
async function cachedOrgs(userId: string): Promise<Awaited<ReturnType<typeof listMyOrgs>>> {
  const hit = orgsCache.get(userId);
  if (hit && Date.now() - hit.at < ORGS_TTL_MS) return hit.list;
  const list = await listMyOrgs(userId);
  orgsCache.set(userId, { at: Date.now(), list });
  return list;
}

/**
 * Frame data, once per request (React cache): user country, orgs and flags
 * fetched in parallel instead of the old serial user → orgs → flags chain
 * that every navigation paid for. The user row reuses the TTL actor cache
 * from lib/ctx (no second indexed user read on the same request).
 */
const frameData = cache(async (userId: string) => {
  // Reuse the request's user row and orgs (no second read), plus the unread chat badge (P6-T14).
  const [user, orgs, unread, profile] = await Promise.all([
    loadUserRow(userId),
    cachedOrgs(userId),
    unreadTotal({ kind: 'user', userId, isAdmin: false }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, phone: true } }),
  ]);
  if (!user) throw new Error('user row vanished mid-request');
  const flags = await getFlagsFor(user.countryCode ?? '');
  const role = roleForOrgs(orgs);
  return { role, flags, unread, account: accountFrom(role, orgs, profile) };
});

function accountFrom(
  role: AppRole,
  orgs: Awaited<ReturnType<typeof listMyOrgs>>,
  profile: { name: string; phone: string | null } | null,
): AccountInfo {
  const org = role === 'host' ? undefined : orgs.find((row) => row.org.kind === role.toUpperCase())?.org;
  // Phone sign-ups carry their number as a name until onboarding.
  const name = profile && profile.name && profile.name !== profile.phone ? profile.name : '';
  return { name: name || (profile?.phone ?? ''), role, orgName: org?.name ?? null };
}

/** Name, role and business for the account menu outside the app frame (marketplace top bar). */
export async function loadAccount(userId: string): Promise<AccountInfo> {
  const [orgs, profile] = await Promise.all([
    cachedOrgs(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, phone: true } }),
  ]);
  return accountFrom(roleForOrgs(orgs), orgs, profile);
}

/** Signed-in app frame: role navigation plus the user's resolved feature flags for client components. */
export async function AppFrame({
  userId,
  active,
  title,
  sectionTabs,
  children,
}: {
  userId: string;
  active: string;
  title: string;
  sectionTabs?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { role, flags, unread, account } = await frameData(userId);
  const t = await getTranslations('account');
  return (
    <FlagsProvider flags={flags}>
      <AppShell
        role={role}
        active={active}
        title={title}
        sectionTabs={sectionTabs}
        badges={{ inbox: unread }}
        roleLabel={t(`workspace.${role}`)}
        account={<AccountMenu account={account} />}
        accountCompact={<AccountMenu account={account} compact />}
        search={role === 'planner' ? <CommandPalette /> : undefined}
      >
        {children}
      </AppShell>
    </FlagsProvider>
  );
}
