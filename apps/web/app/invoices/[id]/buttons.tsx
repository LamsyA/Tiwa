'use client';

import { Banner, Button } from '@tiwa/ui';
import { CheckCircle2, Printer, Send, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { markInvoicePaidAction, sendInvoiceAction, voidInvoiceAction } from '../actions.js';

/** Send → mark paid / void. Each refreshes the page and shows errors. */
export function InvoiceButtons({ invoiceId, status }: { invoiceId: string; status: string }) {
  const t = useTranslations('planner');
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run(key: string, action: (input: { invoiceId: string }) => Promise<{ ok: boolean }>) {
    setBusy(key);
    setError(null);
    const result = await action({ invoiceId });
    setBusy(null);
    if (!result.ok) setError(t('errors.generic'));
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 print:hidden">
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="flex flex-wrap gap-2">
        {status === 'DRAFT' && (
          <Button
            className="rounded-full"
            loading={busy === 'send'}
            onClick={() => void run('send', sendInvoiceAction)}
          >
            <Send className="size-4" aria-hidden />
            {t('sendInvoice')}
          </Button>
        )}
        {status === 'SENT' && (
          <>
            <Button
              className="rounded-full"
              loading={busy === 'paid'}
              onClick={() => void run('paid', markInvoicePaidAction)}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              {t('markPaid')}
            </Button>
            <Button
              variant="secondary"
              className="rounded-full"
              loading={busy === 'void'}
              onClick={() => void run('void', voidInvoiceAction)}
            >
              <XCircle className="size-4" aria-hidden />
              {t('voidAction')}
            </Button>
          </>
        )}
        <Button variant="ghost" className="rounded-full" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          {t('print')}
        </Button>
      </div>
    </div>
  );
}
