import { getProposal } from '@tiwa/core';
import { Card, buttonClasses } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ProposalActions } from './actions-ui.js';

/** Proposal document (P10-T04): branded, totals, send/accept, print-ready. */
export default async function ProposalPage({ params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await params;
  const ctx = await requirePageUser(`/clients/${id}/proposals/${proposalId}`);
  const t = await getTranslations('planner');
  let data;
  try {
    data = await getProposal(ctx.actor, proposalId);
  } catch {
    notFound();
  }
  const body = data.proposal.body as {
    items: { label: string; qty: number; unitMinor: string }[];
    notes?: string | null;
  };
  return (
    <AppFrame userId={ctx.actor.userId} active="clients" title={data.proposal.title}>
      <div className="flex flex-col gap-4 py-2">
        <Card className="p-4">
          <p className="text-muted text-sm">{data.org?.name}</p>
          <h2 className="text-xl font-semibold">{data.proposal.title}</h2>
          <p className="text-muted text-sm">{data.client?.name}</p>
        </Card>
        <Card className="p-4">
          <ul className="flex flex-col gap-2">
            {body.items.map((it, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>
                  {it.label} × {it.qty}
                </span>
                <span>{it.unitMinor}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 font-semibold">
            {t('totalLabel')}: {data.proposal.totalMinor} {data.proposal.currency}
          </p>
          {body.notes && <p className="text-muted mt-2 text-sm">{body.notes}</p>}
        </Card>
        <ProposalActions proposalId={data.proposal.id} status={data.proposal.status} />
        <button type="button" onClick={() => window.print()} className={buttonClasses({ variant: 'secondary' })}>
          {t('print')}
        </button>
      </div>
    </AppFrame>
  );
}
