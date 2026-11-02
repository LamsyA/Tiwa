'use client';

import { Button } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { declineEnquiryAction } from './actions.js';

/** Vendor turns down a quote request (busy that day, not a fit). The host sees it as declined. */
export function DeclineEnquiry({ requestId }: { requestId: string }) {
  const t = useTranslations('quotes.enquiry');
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  if (!confirming) {
    return (
      <Button variant="ghost" className="rounded-full" onClick={() => setConfirming(true)}>
        {t('decline')}
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-muted text-sm">{t('declineConfirm')}</span>
      <Button
        variant="destructive"
        size="sm"
        loading={working}
        onClick={async () => {
          setWorking(true);
          const result = await declineEnquiryAction({ requestId });
          setWorking(false);
          setFailed(!result.ok);
          if (result.ok) router.refresh();
        }}
      >
        {t('declineYes')}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        {t('keep')}
      </Button>
      {failed && (
        <span role="alert" className="text-danger text-xs">
          {t('declineFailed')}
        </span>
      )}
    </span>
  );
}
