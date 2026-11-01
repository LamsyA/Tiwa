'use client';

import { useTranslations } from 'next-intl';
import { decideProposalAction, sendProposalAction } from '../../../actions.js';

export function ProposalActions({ proposalId, status }: { proposalId: string; status: string }) {
  const t = useTranslations('planner');
  if (status === 'DRAFT') {
    return (
      <button
        type="button"
        onClick={() => sendProposalAction({ proposalId })}
        className="bg-brand-strong text-on-brand rounded-md px-4 py-2 text-sm font-medium"
      >
        {t('send')}
      </button>
    );
  }
  if (status === 'SENT') {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => decideProposalAction({ proposalId, accepted: true })}
          className="bg-brand-strong text-on-brand rounded-md px-4 py-2 text-sm font-medium"
        >
          {t('accept')}
        </button>
        <button
          type="button"
          onClick={() => decideProposalAction({ proposalId, accepted: false })}
          className="border-border rounded-md border px-4 py-2 text-sm font-medium"
        >
          {t('decline')}
        </button>
      </div>
    );
  }
  return null;
}
