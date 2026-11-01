import { listClients, listMyOrgs, plannerDashboard } from '@tiwa/core';
import { Badge, Card, EmptyState, StatCard, buttonClasses } from '@tiwa/ui';
import { CalendarPlus, Plus, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';

/** Planner home (PLN-01, UF-21): needs-today, week events, pipeline, quick actions. */
export default async function HomePage() {
  const ctx = await requirePageUser('/home');
  const t = await getTranslations('home');
  const tp = await getTranslations('planner');
  const orgs = await listMyOrgs(ctx.actor.userId);
  const plannerOrg = orgs.find((r) => r.org.kind === 'PLANNER')?.org;

  if (!plannerOrg) {
    return (
      <AppFrame userId={ctx.actor.userId} active="home" title={t('title')}>
        <EmptyState
          icon={<CalendarPlus className="size-8" aria-hidden />}
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={
            <Link href="/events/new" className={buttonClasses()}>
              {t('createEvent')}
            </Link>
          }
        />
      </AppFrame>
    );
  }

  const [dash, clients] = await Promise.all([
    plannerDashboard(ctx.actor, { orgId: plannerOrg.id }),
    listClients(ctx.actor, { orgId: plannerOrg.id }),
  ]);

  return (
    <AppFrame userId={ctx.actor.userId} active="home" title={tp('title')}>
      <div className="flex flex-col gap-4 py-2">
        <section aria-label={tp('needsToday')} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label={tp('needsToday')}
            value={String(dash.needsToday.overdueTasks)}
            help={tp('overdueTasks', { count: dash.needsToday.overdueTasks })}
          />
          <StatCard
            label={tp('weekEvents')}
            value={String(dash.weekEvents.length)}
            help={tp('paymentsDue', { count: dash.needsToday.paymentsDue })}
          />
          <StatCard
            label={tp('pipeline')}
            value={String(dash.totals.clients)}
            help={tp('openEnquiries', { count: dash.needsToday.openEnquiries })}
          />
        </section>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{tp('weekEvents')}</h2>
            <Link href="/events" className={buttonClasses({ variant: 'ghost' })}>
              {tp('viewAll')}
            </Link>
          </div>
          {dash.weekEvents.length === 0 ? (
            <p className="text-muted text-sm">{tp('noNeeds')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dash.weekEvents.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="text-brand-strong text-sm font-medium">
                    {e.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{tp('pipeline')}</h2>
            <Link href="/clients?view=pipeline" className={buttonClasses({ variant: 'ghost' })}>
              {tp('viewAll')}
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {dash.pipeline.map((s) => (
              <Badge key={s.stage}>{`${tp(`stages.${s.stage}`)} · ${s.count}`}</Badge>
            ))}
          </div>
          {clients.length === 0 && <p className="text-muted mt-2 text-sm">{tp('emptyClients')}</p>}
        </Card>

        <div className="flex flex-wrap gap-2">
          <Link href="/events/new" className={buttonClasses()}>
            <Plus aria-hidden className="size-5" />
            {tp('newEvent')}
          </Link>
          <Link href="/clients" className={buttonClasses({ variant: 'secondary' })}>
            <Users aria-hidden className="size-5" />
            {tp('addClient')}
          </Link>
        </div>
      </div>
    </AppFrame>
  );
}
