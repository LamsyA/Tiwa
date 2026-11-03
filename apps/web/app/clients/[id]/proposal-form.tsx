'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createProposalAction } from '../actions.js';

/** Minimal proposal creator: one line item, server totals with BigInt. */
export function ProposalForm({ orgId, clientId }: { orgId: string; clientId: string }) {
  const t = useTranslations('planner');
  const [pending, setPending] = useState(false);
  return (
    <form
      className="bg-surface flex flex-col gap-2 rounded-lg p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setPending(true);
        try {
          await createProposalAction({
            orgId,
            clientId,
            title: String(data.get('title') ?? ''),
            currency: 'NGN',
            items: [
              {
                label: String(data.get('label') ?? 'Planning'),
                qty: Number(data.get('qty') ?? 1),
                unitMinor: String(data.get('amount') ?? '0'),
              },
            ],
            notes: String(data.get('notes') ?? '') || undefined,
          });
          form.reset();
        } finally {
          setPending(false);
        }
      }}
    >
      <h3 className="font-display text-base font-bold tracking-tight">{t('newProposalTitle')}</h3>
      <label className="flex flex-col gap-1 text-sm">
        {t('titleLabel')}
        <input name="title" required maxLength={160} className="border-border rounded-xl border px-3 py-2" />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t('titleLabel')}
          <input name="label" defaultValue="Planning" className="border-border rounded-xl border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('qtyLabel')}
          <input
            name="qty"
            type="number"
            min={1}
            defaultValue={1}
            className="border-border rounded-xl border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('totalLabel')}
          <input
            name="amount"
            inputMode="numeric"
            defaultValue="500000"
            className="border-border rounded-xl border px-3 py-2"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-brand-strong text-on-brand rounded-xl px-4 py-2 text-sm font-medium"
      >
        {t('create')}
      </button>
    </form>
  );
}
