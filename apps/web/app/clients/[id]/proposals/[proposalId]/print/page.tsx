import { getProposal } from '@tiwa/core';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PrintShell } from '@/components/documents/print-shell.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ProposalDocument } from '../proposal-document.js';

/** Print view of a proposal: the browser's "Save as PDF" makes the file (D-X47). */
export default async function ProposalPrintPage({ params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await params;
  const ctx = await requirePageUser(`/clients/${id}/proposals/${proposalId}/print`);
  const t = await getTranslations('planner');
  const data = await getProposal(ctx.actor, proposalId).catch(() => null);
  if (!data) notFound();
  return (
    <PrintShell
      backHref={`/clients/${id}/proposals/${proposalId}`}
      backLabel={data.proposal.title}
      printLabel={t('downloadPdf')}
    >
      <ProposalDocument data={data} />
    </PrintShell>
  );
}
