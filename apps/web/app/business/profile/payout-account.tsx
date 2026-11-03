'use client';

import { Banner, Button, Input, Select, StatusPill } from '@tiwa/ui';
import { Landmark, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { removePayoutAccount, savePayoutAccount } from './actions.js';

export interface PayoutAccountView {
  id: string;
  bankName: string;
  last4: string;
  accountName: string;
  verified: boolean;
}

/** Payout bank account (D-X46): owner sets it; everyone else sees it masked. */
export function PayoutAccount({
  orgId,
  account,
  banks,
  canEdit,
  pattern,
}: {
  orgId: string;
  account: PayoutAccountView | null;
  banks: { code: string; name: string }[];
  canEdit: boolean;
  /** Digits the country's account numbers have (10 for NUBAN), if known. */
  pattern: number | null;
}) {
  const t = useTranslations('business.payout');
  const router = useRouter();
  const [editing, setEditing] = React.useState(account === null);
  const [bankCode, setBankCode] = React.useState('');
  const [bankText, setBankText] = React.useState('');
  const [number, setNumber] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const numberOk = pattern ? number.length === pattern : number.length >= 6;
  const ready = (banks.length > 0 ? bankCode : bankText.trim()) && numberOk && name.trim().length >= 2;

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await savePayoutAccount({
      orgId,
      bankCode: banks.length > 0 ? bankCode : bankText.trim(),
      accountNumber: number,
      accountName: name.trim(),
    });
    setSaving(false);
    if (!result.ok) {
      const key = result.fieldErrors ? Object.values(result.fieldErrors)[0]?.[0] : undefined;
      setError(key && t.has(`errors.${key}`) ? t(`errors.${key}`) : t('errors.generic'));
      return;
    }
    setNumber('');
    setEditing(false);
    router.refresh();
  }

  async function onRemove() {
    if (!account) return;
    const result = await removePayoutAccount({ orgId, bankAccountId: account.id });
    if (!result.ok) setError(t('errors.generic'));
    else {
      setEditing(true);
      router.refresh();
    }
  }

  return (
    <section
      id="payouts"
      aria-labelledby="payout-heading"
      className="border-border/70 bg-surface scroll-mt-24 rounded-3xl border p-5 shadow-[var(--shadow-1)] sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand-strong grid size-10 shrink-0 place-items-center rounded-2xl">
          <Landmark aria-hidden className="size-5" />
        </span>
        <div>
          <h2 id="payout-heading" className="font-display text-lg font-bold tracking-tight">
            {t('heading')}
          </h2>
          <p className="text-muted text-sm">{t('body')}</p>
        </div>
      </div>

      {error && (
        <Banner tone="danger" className="mt-4">
          {error}
        </Banner>
      )}

      {account && !editing && (
        <div className="mt-5 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--brand-strong)_85%,black),#140b07)] p-5 text-white shadow-[0_18px_40px_-22px_rgb(0_0_0/0.6)]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-white/80">{account.bankName}</p>
            <StatusPill tone={account.verified ? 'success' : 'neutral'}>
              {account.verified ? t('verified') : t('unverified')}
            </StatusPill>
          </div>
          <p className="font-display mt-6 text-2xl tracking-[0.2em] tabular-nums">•••• •••• {account.last4}</p>
          <p className="mt-2 text-sm text-white/75">{account.accountName}</p>
          {canEdit && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                {t('change')}
              </button>
              <button
                type="button"
                onClick={() => void onRemove()}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white/80 ring-1 ring-white/25 transition hover:bg-white/10"
              >
                <Trash2 aria-hidden className="size-4" />
                {t('remove')}
              </button>
            </div>
          )}
        </div>
      )}

      {editing && !canEdit && <p className="text-muted mt-4 text-sm">{t('ownerOnly')}</p>}

      {editing && canEdit && (
        <form onSubmit={(event) => void onSave(event)} className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            {banks.length > 0 ? (
              <Select
                label={t('bank')}
                options={banks.map((bank) => ({ value: bank.code, label: bank.name }))}
                value={bankCode}
                onValueChange={setBankCode}
                placeholder={t('bankPlaceholder')}
                searchable
              />
            ) : (
              <label className="flex flex-col gap-1 text-sm font-medium">
                {t('bank')}
                <Input value={bankText} onChange={(event) => setBankText(event.target.value)} />
              </label>
            )}
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('number')}
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={number}
              maxLength={pattern ?? 20}
              onChange={(event) => setNumber(event.target.value.replace(/\D/g, ''))}
              suffix={
                <span className="text-muted text-xs tabular-nums">
                  {pattern ? `${number.length}/${pattern}` : null}
                </span>
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('name')}
            <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          </label>
          <p className="text-muted inline-flex items-start gap-2 text-xs sm:col-span-2">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t('privacy')}
          </p>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={!ready || saving}>
              <ShieldCheck aria-hidden className="size-4" />
              {saving ? t('saving') : t('save')}
            </Button>
            {account && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t('cancel')}
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
