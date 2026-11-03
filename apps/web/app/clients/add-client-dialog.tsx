'use client';

import { Banner, Button, Input, ResponsiveDialog, Textarea } from '@tiwa/ui';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { createClientAction } from './actions.js';

/** Add a client or lead (PLN-02): name required, contact details optional. */
export function AddClientDialog({ orgId, variant = 'primary' }: { orgId: string; variant?: 'primary' | 'secondary' }) {
  const t = useTranslations('planner');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    const result = await createClientAction({
      orgId,
      name: String(data.get('name') ?? ''),
      phone: String(data.get('phone') ?? '') || undefined,
      email: String(data.get('email') ?? '') || undefined,
      notes: String(data.get('notes') ?? '') || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.fieldErrors?.email ? t('errors.invalidEmail') : t('errors.generic'));
      return;
    }
    form.reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant={variant} className="rounded-full">
          <Plus className="size-4" aria-hidden />
          {t('addClient')}
        </Button>
      }
      title={t('addClientTitle')}
      description={t('addClientBody')}
    >
      <form className="flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)}>
        {error && <Banner tone="danger">{error}</Banner>}
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('nameLabel')}
          <Input name="name" required maxLength={120} autoFocus placeholder={t('namePlaceholder')} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('phoneLabel')}
            <Input name="phone" type="tel" inputMode="tel" maxLength={30} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('emailLabel')}
            <Input name="email" type="email" maxLength={160} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('notesLabel')}
          <Textarea name="notes" rows={3} maxLength={2000} placeholder={t('notesPlaceholder')} />
        </label>
        <Button type="submit" loading={busy} className="rounded-full">
          {t('create')}
        </Button>
      </form>
    </ResponsiveDialog>
  );
}
