'use client';

import { useTranslations } from 'next-intl';
import { markInvoicePaidAction, sendInvoiceAction, voidInvoiceAction } from '../actions.js';

export function InvoiceButtons({ invoiceId, status }: { invoiceId: string; status: string }) {
  const t = useTranslations('planner');
  if (status === 'DRAFT') {
    return (
      <button
        type="button"
        onClick={() => sendInvoiceAction({ invoiceId })}
        className="bg-brand-strong text-on-brand rounded-md px-4 py-2 text-sm font-medium"
      >
        {t('sendInvoice')}
      </button>
    );
  }
  if (status === 'SENT') {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => markInvoicePaidAction({ invoiceId })}
          className="bg-brand-strong text-on-brand rounded-md px-4 py-2 text-sm font-medium"
        >
          {t('markPaid')}
        </button>
        <button
          type="button"
          onClick={() => voidInvoiceAction({ invoiceId })}
          className="border-border rounded-md border px-4 py-2 text-sm font-medium"
        >
          {t('voidAction')}
        </button>
      </div>
    );
  }
  return null;
}
