'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createInvoiceAction } from './actions.js';

export function InvoiceForm({ orgId }: { orgId: string }) {
  const t = useTranslations('planner');
  const [pending, setPending] = useState(false);
  return (
    <form
      className="bg-surface flex flex-col gap-2 rounded-lg p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setPending(true);
        try {
          await createInvoiceAction({
            orgId,
            items: [
              {
                label: String(data.get('label') ?? 'Service'),
                qty: Number(data.get('qty') ?? 1),
                unitMinor: String(data.get('amount') ?? '0'),
              },
            ],
            currency: 'NGN',
            dueAt: new Date(String(data.get('due') ?? '')).toISOString(),
          });
          e.currentTarget.reset();
        } finally {
          setPending(false);
        }
      }}
    >
      <h3 className="font-semibold">{t('newInvoiceHeading')}</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          {t('titleLabel')}
          <input name="label" defaultValue="Service" className="border-border rounded-md border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('qtyLabel')}
          <input
            name="qty"
            type="number"
            min={1}
            defaultValue={1}
            className="border-border rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('totalLabel')}
          <input
            name="amount"
            inputMode="numeric"
            defaultValue="500000"
            className="border-border rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('dueLabel')}
          <input name="due" type="date" required className="border-border rounded-md border px-3 py-2" />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-brand-strong text-on-brand rounded-md px-4 py-2 text-sm font-medium"
      >
        {t('create')}
      </button>
    </form>
  );
}
