import { listMyOrgs } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { navigationForRole } from '@tiwa/ui';
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame, roleForUser } from '@/components/app-frame.js';
import { Avatar, RoleBadge, SignOutButton } from '@/components/account-menu.js';
import { requirePageUser } from '@/lib/ctx.js';

/** Mobile "More": who you are, every section the bottom tabs leave out, and sign out. */
export default async function MorePage() {
  const ctx = await requirePageUser('/more');
  const t = await getTranslations('account');
  const [role, user, orgs] = await Promise.all([
    roleForUser(ctx.actor.userId),
    prisma.user.findUniqueOrThrow({
      where: { id: ctx.actor.userId },
      select: { name: true, phone: true, email: true },
    }),
    listMyOrgs(ctx.actor.userId),
  ]);
  const org = role === 'host' ? undefined : orgs.find((row) => row.org.kind === role.toUpperCase())?.org;
  const name = user.name && user.name !== user.phone ? user.name : (user.phone ?? '');
  const account = { name, role, orgName: org?.name ?? null };
  const links = navigationForRole(role).sidebar.filter((item) => item.key !== 'home');

  return (
    <AppFrame userId={ctx.actor.userId} active="more" title={t('moreTitle')}>
      <div className="mx-auto flex max-w-xl flex-col gap-6 py-2">
        <section className="border-border/70 bg-surface flex items-center gap-4 rounded-3xl border p-5 shadow-[var(--shadow-1)]">
          <Avatar account={account} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-lg font-bold">{name}</p>
            <p className="text-muted truncate text-sm">{user.email ?? user.phone}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <RoleBadge role={role} />
              {org && <span className="text-muted truncate text-xs">{org.name}</span>}
            </div>
          </div>
        </section>

        <nav aria-label={t('moreTitle')}>
          <ul className="border-border/70 bg-surface divide-border/60 divide-y overflow-hidden rounded-3xl border">
            {links.map((link) => (
              <li key={link.key}>
                <Link href={link.href} className="hover:bg-surface-2 flex items-center gap-3 px-5 py-4 transition">
                  <span className="text-muted">{link.icon}</span>
                  <span className="flex-1 font-medium">{link.label}</span>
                  <ChevronRight aria-hidden className="text-muted size-4" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <SignOutButton />
      </div>
    </AppFrame>
  );
}
