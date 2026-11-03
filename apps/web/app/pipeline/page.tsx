import { listClients, listMyOrgs } from '@tiwa/core';
import { EmptyState } from '@tiwa/ui';
import { Layers } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { AddClientDialog } from '../clients/add-client-dialog.js';
import { PipelineBoard } from './board.js';

/** Planner pipeline (PLN-03): every lead by stage, movable by drag or "Move to". */
export default async function PipelinePage() {
  const ctx = await requirePageUser('/pipeline');
  const t = await getTranslations('planner');
  const orgs = await listMyOrgs(ctx.actor.userId);
  const plannerOrg = orgs.find((row) => row.org.kind === 'PLANNER')?.org;
  if (!plannerOrg) {
    return (
      <AppFrame userId={ctx.actor.userId} active="pipeline" title={t('pipeline')}>
        <EmptyState icon={<Layers className="size-8" aria-hidden />} title={t('plannerOnly')} body="" />
      </AppFrame>
    );
  }
  const clients = await listClients(ctx.actor, { orgId: plannerOrg.id });
  const won = clients.filter((client) => client.stage === 'WON').length;
  const closed = won + clients.filter((client) => client.stage === 'LOST').length;
  return (
    <AppFrame userId={ctx.actor.userId} active="pipeline" title={t('pipeline')}>
      <div className="flex flex-col gap-5 py-2">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-muted text-sm">
              {t('pipelineSummary', {
                open: clients.length - closed,
                rate: closed > 0 ? Math.round((won / closed) * 100) : 0,
              })}
            </p>
          </div>
          <AddClientDialog orgId={plannerOrg.id} />
        </header>
        {clients.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-8" aria-hidden />}
            title={t('pipelineEmpty')}
            body={t('pipelineEmptyBody')}
          />
        ) : (
          <PipelineBoard
            cards={clients.map((client) => ({
              id: client.id,
              name: client.name,
              phone: client.phone,
              email: client.email,
              stage: client.stage,
              createdAt: client.createdAt.toISOString(),
              proposals: client._count.proposals,
              invoices: client._count.invoices,
            }))}
          />
        )}
      </div>
    </AppFrame>
  );
}
