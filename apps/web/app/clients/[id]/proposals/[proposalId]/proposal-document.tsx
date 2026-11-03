import type { getProposal } from '@tiwa/core';
import { DateText } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { BrandedDocument } from '@/components/documents/branded-document.js';

const TONE = { DRAFT: 'neutral', SENT: 'warning', ACCEPTED: 'success', DECLINED: 'danger' } as const;

/** The proposal as a branded document, shared by the page and its print view (D-X47). */
export async function ProposalDocument({ data }: { data: Awaited<ReturnType<typeof getProposal>> }) {
  const t = await getTranslations('planner');
  const { proposal, client, org } = data;
  const body = proposal.body as { items: { label: string; qty: number; unitMinor: string }[]; notes?: string | null };
  return (
    <BrandedDocument
      org={{ id: proposal.orgId, name: org?.name ?? '', city: org?.city ?? null, hasLogo: Boolean(org?.logoKey) }}
      kindLabel={t('proposalWord')}
      heading={proposal.title}
      status={{
        label: t.has(`proposalStatus.${proposal.status}`) ? t(`proposalStatus.${proposal.status}`) : proposal.status,
        tone: TONE[proposal.status as keyof typeof TONE] ?? 'neutral',
      }}
      parties={[
        { label: t('preparedFor'), value: client?.name ?? '—', sub: client?.email ?? client?.phone },
        { label: t('issued'), value: <DateText value={proposal.createdAt} format="date" /> },
        { label: t('preparedBy'), value: org?.name ?? '—' },
      ]}
      lines={body.items}
      currency={proposal.currency}
      totalMinor={proposal.totalMinor}
      notes={body.notes}
      labels={{
        item: t('itemsLabel'),
        qty: t('qtyLabel'),
        unit: t('unitLabel'),
        amount: t('amountLabel'),
        total: t('totalLabel'),
      }}
    />
  );
}
