'use client';

import { Banner, Button, Input, MoneyInput, MoneyText, ResponsiveDialog, Select, Textarea } from '@tiwa/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { createInvoiceAction } from './actions.js';

interface Line {
  label: string;
  qty: number;
  unitMinor: string;
}

function inDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** New invoice (PLN-08): client, line items in money (not kobo), due date, note. Saves as a draft. */
export function InvoiceForm({
  orgId,
  currency,
  clients,
  defaultClientId,
}: {
  orgId: string;
  currency: string;
  clients: { id: string; name: string }[];
  defaultClientId?: string;
}) {
  const t = useTranslations('planner');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [clientId, setClientId] = React.useState(defaultClientId ?? '');
  const [lines, setLines] = React.useState<Line[]>([{ label: '', qty: 1, unitMinor: '' }]);
  const [due, setDue] = React.useState(inDays(14));
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const total = lines.reduce((sum, line) => sum + BigInt(line.qty || 0) * BigInt(line.unitMinor || '0'), 0n);
  const valid = lines.every((line) => line.label.trim() && line.qty > 0) && total > 0n && due;

  function update(i: number, patch: Partial<Line>) {
    setLines((rows) => rows.map((row, at) => (at === i ? { ...row, ...patch } : row)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await createInvoiceAction({
      orgId,
      ...(clientId ? { clientId } : {}),
      items: lines.map((line) => ({ label: line.label.trim(), qty: line.qty, unitMinor: line.unitMinor || '0' })),
      currency,
      dueAt: new Date(`${due}T12:00:00Z`).toISOString(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(t('errors.generic'));
      return;
    }
    setOpen(false);
    router.push(`/invoices/${result.data.id}`);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button className="rounded-full">
          <Plus className="size-4" aria-hidden />
          {t('newInvoiceHeading')}
        </Button>
      }
      title={t('newInvoiceHeading')}
      description={t('newInvoiceBody')}
      className="md:max-w-xl"
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        <Select
          label={t('clientLabel')}
          searchable={clients.length > 6}
          value={clientId || 'none'}
          onValueChange={(value) => setClientId(value === 'none' ? '' : value)}
          options={[
            { value: 'none', label: t('noClient') },
            ...clients.map((client) => ({ value: client.id, label: client.name })),
          ]}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('itemsLabel')}</legend>
          {lines.map((line, i) => (
            <div
              key={i}
              className="border-border/70 grid grid-cols-[1fr_auto] gap-2 rounded-2xl border p-2.5 sm:grid-cols-[1fr_4.5rem_9rem_auto]"
            >
              <Input
                aria-label={t('itemName', { n: i + 1 })}
                placeholder={t('itemPlaceholder')}
                className="col-span-2 sm:col-span-1"
                value={line.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <Input
                aria-label={t('itemQty', { n: i + 1 })}
                type="number"
                min={1}
                inputMode="numeric"
                value={String(line.qty)}
                onChange={(e) => update(i, { qty: Number(e.target.value) || 0 })}
              />
              <MoneyInput
                aria-label={t('itemPrice', { n: i + 1 })}
                currency={currency}
                value={line.unitMinor}
                onValueChange={(value) => update(i, { unitMinor: value })}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('removeItem')}
                disabled={lines.length === 1}
                onClick={() => setLines((rows) => rows.filter((_, at) => at !== i))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setLines((rows) => [...rows, { label: '', qty: 1, unitMinor: '' }])}
          >
            <Plus className="size-4" aria-hidden />
            {t('addItem')}
          </Button>
        </fieldset>
        <div className="bg-surface-2 flex items-center justify-between rounded-2xl px-4 py-3">
          <span className="text-muted text-sm">{t('totalLabel')}</span>
          <span className="font-display text-xl font-bold">
            <MoneyText value={total.toString()} currency={currency} />
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('dueLabel')}
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('notesLabel')}
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('invoiceNotesPlaceholder')}
          />
        </label>
        <Button className="rounded-full" disabled={!valid} loading={busy} onClick={() => void submit()}>
          {t('createInvoice')}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
