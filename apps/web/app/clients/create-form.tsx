'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createClientAction } from './actions.js';

/** Minimal CRM add-client form (progressive enhancement: full page reload). */
export function CreateClientForm({ orgId }: { orgId: string }) {
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
          await createClientAction({
            orgId,
            name: String(data.get('name') ?? ''),
            phone: String(data.get('phone') ?? '') || undefined,
            email: String(data.get('email') ?? '') || undefined,
            notes: String(data.get('notes') ?? '') || undefined,
          });
          form.reset();
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {t('nameLabel')}
          <input name="name" required maxLength={120} className="border-border rounded-md border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('phoneLabel')}
          <input name="phone" maxLength={30} className="border-border rounded-md border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('emailLabel')}
          <input name="email" type="email" maxLength={160} className="border-border rounded-md border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('notesLabel')}
          <input name="notes" maxLength={2000} className="border-border rounded-md border px-3 py-2" />
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
