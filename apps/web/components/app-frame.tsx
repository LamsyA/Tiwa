import { listMyOrgs } from '@tiwa/core';
import { AppShell, type AppRole } from '@tiwa/ui';
import type * as React from 'react';

/** Navigation follows the user's business, if any (Frontend.md §5.4); everyone else gets the host frame. */
export async function roleForUser(userId: string): Promise<AppRole> {
  const orgs = await listMyOrgs(userId);
  if (orgs.some((row) => row.org.kind === 'PLANNER')) return 'planner';
  if (orgs.some((row) => row.org.kind === 'VENDOR')) return 'vendor';
  return 'host';
}

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
  return (
    <AppShell role={await roleForUser(userId)} active={active} title={title} sectionTabs={sectionTabs}>
      {children}
    </AppShell>
  );
}
