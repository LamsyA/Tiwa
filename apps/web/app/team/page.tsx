import { listMembers, listMyOrgs, listTeamAssignments, plannerCalendar } from '@tiwa/core';
import { Avatar, EmptyState } from '@tiwa/ui';
import { Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { AssignForm } from './assign-form.js';

/** Planner team (PLN-05, P10-T05): staff list, assignments, assign form. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const ctx = await requirePageUser('/team');
  const t = await getTranslations('planner');
  const { org: orgParam } = await searchParams;
  const orgs = await listMyOrgs(ctx.actor.userId);
  const plannerOrgs = orgs.filter((r) => r.org.kind === 'PLANNER');
  const current = plannerOrgs.find((r) => r.org.id === orgParam) ?? plannerOrgs[0];
  if (!current) {
    return (
      <AppFrame userId={ctx.actor.userId} active="clients" title={t('teamTitle')}>
        <EmptyState icon={<Users className="size-8" aria-hidden />} title={t('emptyClients')} body="" />
      </AppFrame>
    );
  }
  const [members, assignments, events] = await Promise.all([
    listMembers(ctx.actor, current.org.id),
    listTeamAssignments(ctx.actor, current.org.id),
    plannerCalendar(ctx.actor, current.org.id),
  ]);
  return (
    <AppFrame userId={ctx.actor.userId} active="clients" title={t('teamTitle')}>
      <div className="flex flex-col gap-4 py-2">
        <section className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold tracking-tight">{t('teamTitle')}</h2>
            <Link href="/settings/team" className="text-brand-strong text-xs font-semibold hover:underline">
              {t('viewAll')}
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {members.members.map((m) => (
              <li key={m.userId} className="bg-surface-2/60 flex items-center gap-3 rounded-2xl p-2.5">
                <Avatar name={m.name ?? m.contact ?? '?'} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {m.name ?? m.contact ?? t('unnamed')}
                    {m.userId === ctx.actor.userId && <span className="text-muted font-normal"> · {t('you')}</span>}
                  </span>
                  {m.contact && <span className="text-muted block truncate text-xs">{m.contact}</span>}
                </span>
                <span className="bg-teal-soft text-teal-strong shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  {t(`orgRole.${m.role}` as 'orgRole.OWNER')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-border/70 bg-surface flex flex-col gap-2 rounded-3xl border p-4 sm:p-5">
          <h2 className="font-display text-base font-bold tracking-tight">{t('assignmentsHeading')}</h2>
          {assignments.length === 0 ? (
            <p className="text-muted text-sm">{t('noAssignments')}</p>
          ) : (
            <ul className="divide-border/60 -mx-1 divide-y">
              {assignments.map((a) => (
                <li key={a.eventId}>
                  <Link
                    href={`/events/${a.eventId}`}
                    className="hover:bg-surface-2 flex items-center gap-3 rounded-xl px-1 py-2 text-sm transition"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{a.eventName}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        a.staff.length > 0 ? 'bg-teal-soft text-teal-strong' : 'bg-surface-2 text-muted'
                      }`}
                    >
                      {t('staffCount', { count: a.staff.length })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <AssignForm orgId={current.org.id} members={members.members} events={events} />
      </div>
    </AppFrame>
  );
}
