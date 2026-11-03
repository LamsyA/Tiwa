'use client';

import { Banner, Button } from '@tiwa/ui';
import { Check, Send, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { decideProposalAction, sendProposalAction } from '../../../actions.js';

/** Send a draft; record the client's yes or no once sent. */
export function ProposalActions({ proposalId, status }: { proposalId: string; status: string }) {
  const t = useTranslations('planner');
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  async function run(key: string, action: () => Promise<{ ok: boolean }>) {
    setBusy(key);
    setError(false);
    const result = await action();
    setBusy(null);
    if (!result.ok) setError(true);
    else router.refresh();
  }

  if (status !== 'DRAFT' && status !== 'SENT') return null;
  return (
    <div className="flex flex-col gap-2 print:hidden">
      {error && <Banner tone="danger">{t('errors.generic')}</Banner>}
      <div className="flex flex-wrap gap-2">
        {status === 'DRAFT' ? (
          <Button
            className="rounded-full"
            loading={busy === 'send'}
            onClick={() => void run('send', () => sendProposalAction({ proposalId }))}
          >
            <Send aria-hidden className="size-4" />
            {t('send')}
          </Button>
        ) : (
          <>
            <Button
              className="rounded-full"
              loading={busy === 'yes'}
              onClick={() => void run('yes', () => decideProposalAction({ proposalId, accepted: true }))}
            >
              <Check aria-hidden className="size-4" />
              {t('accept')}
            </Button>
            <Button
              variant="secondary"
              className="rounded-full"
              loading={busy === 'no'}
              onClick={() => void run('no', () => decideProposalAction({ proposalId, accepted: false }))}
            >
              <X aria-hidden className="size-4" />
              {t('decline')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
