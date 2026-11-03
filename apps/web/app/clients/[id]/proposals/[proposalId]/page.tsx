import { getProposal } from '@tiwa/core';
import { buttonClasses } from '@tiwa/ui';
import { Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ProposalActions } from './actions-ui.js';
import { ProposalDocument } from './proposal-document.js';

/** Proposal (P10-T04, D-X47): branded document, send / record decision, PDF download. */
export default async function ProposalPage({ params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await params;
  const ctx = await requirePageUser(`/clients/${id}/proposals/${proposalId}`);
  const t = await getTranslations('planner');
  const data = await getProposal(ctx.actor, proposalId).catch(() => null);
  if (!data) notFound();
  return (
    <AppFrame userId={ctx.actor.userId} active="clients" title={data.proposal.title}>
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/clients/${id}`} className="text-brand-strong text-sm font-semibold hover:underline">
            ← {data.client?.name ?? t('clientsTitle')}
          </Link>
          <Link
            href={`/clients/${id}/proposals/${proposalId}/print`}
            className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'rounded-full' })}
          >
            <Download aria-hidden className="size-4" />
            {t('downloadPdf')}
          </Link>
        </div>
        <ProposalDocument data={data} />
        <ProposalActions proposalId={data.proposal.id} status={data.proposal.status} />
      </div>
    </AppFrame>
  );
}
