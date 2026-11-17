'use client';

import { Button } from '@tiwa/ui';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { decideChange } from './actions.js';

export function DecisionButtons({ token }: { token: string }) {
  const t = useTranslations('changeLink');
  const router = useRouter();
  const [busy, setBusy] = React.useState<'yes' | 'no' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function decide(accept: boolean) {
    setBusy(accept ? 'yes' : 'no');
    setError(null);
    const result = await decideChange(token, accept);
    setBusy(null);
    if (!result.ok) setError(result.error === 'alreadyDecided' ? t('alreadyDecided') : t('failed'));
    router.refresh();
  }

  return (
    <div className="sticky bottom-3 z-10 flex flex-col gap-2">
      {error && <p className="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm font-medium">{error}</p>}
      <Button
        className="h-14 rounded-2xl text-base shadow-[var(--shadow-2)]"
        loading={busy === 'yes'}
        disabled={busy !== null}
        onClick={() => void decide(true)}
      >
        <Check aria-hidden className="size-5" />
        {t('approve')}
      </Button>
      <Button
        variant="secondary"
        className="h-12 rounded-2xl"
        loading={busy === 'no'}
        disabled={busy !== null}
        onClick={() => void decide(false)}
      >
        <X aria-hidden className="size-4" />
        {t('decline')}
      </Button>
    </div>
  );
}
