import { getFlagsFor, listMyOrgs, unreadTotal } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { AppShell, type AppRole } from '@tiwa/ui';
import type * as React from 'react';
import { cache } from 'react';
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

/**
 * Frame data, once per request (React cache): user country, orgs and flags
 * fetched in parallel instead of the old serial user → orgs → flags chain
 * that every navigation paid for.
 */
const frameData = cache(async (userId: string) => {
  const [user, orgs, unread] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { countryCode: true } }),
    listMyOrgs(userId),
    unreadTotal({ kind: 'user', userId, isAdmin: false }),
  ]);
  const flags = await getFlagsFor(user.countryCode);
  return { role: roleForOrgs(orgs), flags, unread };
});

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
  const { role, flags, unread } = await frameData(userId);
  return (
    <FlagsProvider flags={flags}>
      <AppShell role={role} active={active} title={title} sectionTabs={sectionTabs} badges={{ inbox: unread }}>
        {children}
      </AppShell>
    </FlagsProvider>
  );
}
