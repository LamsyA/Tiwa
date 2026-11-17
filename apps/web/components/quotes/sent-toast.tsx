'use client';

import { useToast } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

/**
 * Pop-up after a quote or proposal is sent (D-X67). The builder redirects to
 * /quotes?sent=proposal|quote[&revised=1]; this shows the confirmation once and
 * tidies the URL so a refresh doesn't repeat it.
 */
export function SentToast() {
  const params = useSearchParams();
  const router = useRouter();
  const push = useToast();
  const t = useTranslations('quotes.sentToast');
  const shown = React.useRef(false);
  const sent = params.get('sent');
  const revised = params.get('revised') === '1';
  React.useEffect(() => {
    if (shown.current || (sent !== 'proposal' && sent !== 'quote')) return;
    shown.current = true;
    push({
      tone: 'success',
      title: t(revised ? `${sent}RevisedTitle` : `${sent}Title`),
      description: t('body'),
      durationMs: 6000,
    });
    router.replace('/quotes', { scroll: false });
  }, [sent, revised, push, router, t]);
  return null;
}
