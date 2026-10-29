import { getFlagsFor, listMyOrgs } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { AppShell, type AppRole } from '@tiwa/ui';
import type * as React from 'react';
import { FlagsProvider } from './flags.js';

/** Navigation follows the user's business, if any (Frontend.md §5.4); everyone else gets the host frame. */
export async function roleForUser(userId: string): Promise<AppRole> {
  const orgs = await listMyOrgs(userId);
  if (orgs.some((row) => row.org.kind === 'PLANNER')) return 'planner';
  if (orgs.some((row) => row.org.kind === 'VENDOR')) return 'vendor';
  return 'host';
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
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { countryCode: true } });
  const [role, flags] = await Promise.all([roleForUser(userId), getFlagsFor(user.countryCode)]);
  return (
    <FlagsProvider flags={flags}>
      <AppShell role={role} active={active} title={title} sectionTabs={sectionTabs}>
        {children}
      </AppShell>
    </FlagsProvider>
  );
}
