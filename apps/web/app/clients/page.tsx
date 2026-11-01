import { listClients, listMyOrgs } from '@tiwa/core';
import { Badge, Card, EmptyState, buttonClasses } from '@tiwa/ui';
import { Plus, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { CreateClientForm } from './create-form.js';

const STAGES = ['ENQUIRY', 'PROPOSAL_SENT', 'WON', 'LOST'] as const;

/** Planner CRM (PLN-02/PLN-03, P10-T03): list + Kanban pipeline. */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await requirePageUser('/clients');
  const t = await getTranslations('planner');
  const { view } = await searchParams;
  const isPipeline = view === 'pipeline';
  const orgs = await listMyOrgs(ctx.actor.userId);
  const plannerOrg = orgs.find((r) => r.org.kind === 'PLANNER')?.org;
  if (!plannerOrg) {
    return (
      <AppFrame userId={ctx.actor.userId} active="clients" title={t('clientsTitle')}>
        <EmptyState icon={<Users className="size-8" aria-hidden />} title={t('emptyClients')} body="" />
      </AppFrame>
    );
  }
  const clients = await listClients(ctx.actor, { orgId: plannerOrg.id });

  return (
    <AppFrame userId={ctx.actor.userId} active="clients" title={t('clientsTitle')}>
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="bg-surface-2 inline-flex gap-1 rounded-md p-1">
            <Link
              href="/clients"
              aria-current={!isPipeline ? 'page' : undefined}
              className={buttonClasses({ variant: !isPipeline ? 'secondary' : 'ghost' })}
            >
              {t('clientsTitle')}
            </Link>
            <Link
              href="/clients?view=pipeline"
              aria-current={isPipeline ? 'page' : undefined}
              className={buttonClasses({ variant: isPipeline ? 'secondary' : 'ghost' })}
            >
              {t('pipeline')}
            </Link>
          </nav>
          <span className="text-muted text-sm">
            {clients.length} · {plannerOrg.name}
          </span>
        </div>

        <CreateClientForm orgId={plannerOrg.id} />

        {clients.length === 0 ? (
          <EmptyState icon={<Users className="size-8" aria-hidden />} title={t('emptyClients')} body="" />
        ) : isPipeline ? (
          <div className="grid gap-3 md:grid-cols-4">
            {STAGES.map((stage) => (
              <section key={stage} aria-label={t(`stages.${stage}`)} className="bg-surface rounded-lg p-3">
                <h2 className="mb-2 font-semibold">
                  {t(`stages.${stage}`)} · {clients.filter((c) => c.stage === stage).length}
                </h2>
                <ul className="flex flex-col gap-2">
                  {clients
                    .filter((c) => c.stage === stage)
                    .map((c) => (
                      <li key={c.id}>
                        <Card className="p-3">
                          <Link href={`/clients/${c.id}`} className="font-medium">
                            {c.name}
                          </Link>
                          <p className="text-muted text-sm">
                            {c._count.proposals} · {c._count.invoices}
                          </p>
                        </Card>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {STAGES.map((stage) => (
              <li key={stage}>
                <h2 className="text-muted mb-1 text-sm font-medium">
                  {t(`stages.${stage}`)} · {clients.filter((c) => c.stage === stage).length}
                </h2>
                <ul className="flex flex-col gap-2">
                  {clients
                    .filter((c) => c.stage === stage)
                    .map((c) => (
                      <li key={c.id}>
                        <Card className="flex items-center justify-between gap-2 p-3">
                          <Link href={`/clients/${c.id}`} className="font-medium">
                            {c.name}
                          </Link>
                          <Badge>{t(`stages.${c.stage}`)}</Badge>
                        </Card>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <Link href="/events/new" className={buttonClasses({ variant: 'secondary' })}>
          <Plus aria-hidden className="size-5" />
          {t('newEvent')}
        </Link>
      </div>
    </AppFrame>
  );
}
