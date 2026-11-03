import { listMembers, listMyOrgs, listTeamAssignments, plannerCalendar } from '@tiwa/core';
import { Card, EmptyState, buttonClasses } from '@tiwa/ui';
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
        <Card>
          <h2 className="mb-2 font-semibold">{t('teamTitle')}</h2>
          <ul className="flex flex-col gap-1">
            {members.members.map((m) => (
              <li key={m.userId} className="text-sm">
                {m.userId === ctx.actor.userId ? `${m.userId} · you` : m.userId} · {m.role}
              </li>
            ))}
          </ul>
          <Link href="/settings/team" className={buttonClasses({ variant: 'ghost' })}>
            {t('viewAll')}
          </Link>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">{t('assignmentsHeading')}</h2>
          {assignments.length === 0 ? (
            <p className="text-muted text-sm">{t('noAssignments')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {assignments.map((a) => (
                <li key={a.eventId} className="text-sm">
                  <Link href={`/events/${a.eventId}`} className="text-brand-strong font-medium">
                    {a.eventName}
                  </Link>
                  <span className="text-muted"> · {a.staff.length}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <AssignForm orgId={current.org.id} members={members.members} events={events} />
      </div>
    </AppFrame>
  );
}
