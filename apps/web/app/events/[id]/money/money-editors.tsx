'use client';

import {
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  Input,
  MoneyInput,
  ResponsiveDialog,
  MoneyText,
  Select,
} from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  addContributionAction,
  addExpenseAction,
  deleteContributionAction,
  deleteExpenseAction,
  recordReceivedAction,
  setAllocationsAction,
  setExpensePaidAction,
  startExpenseReceiptAction,
} from './actions.js';

type Failure = { ok: false; code: string; fieldErrors?: Record<string, string[] | undefined> };
type Kind = 'family' | 'committee' | 'member' | 'sponsor' | 'other_income';

/** One message per failed action: a field key from core if we have a string for it, else the error code. */
function useFailure() {
  const t = useTranslations('events.money.errors');
  return (result: Failure) => {
    const key = Object.values(result.fieldErrors ?? {}).flat()[0];
    if (key && t.has(key)) return t(key);
    return t.has(result.code) ? t(result.code) : t('generic');
  };
}

function useRun() {
  const router = useRouter();
  const failure = useFailure();
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);
  async function run(action: () => Promise<{ ok: true } | Failure>, after?: () => void) {
    setError(null);
    setWorking(true);
    const result = await action();
    setWorking(false);
    if (!result.ok) {
      setError(failure(result));
      return false;
    }
    after?.();
    router.refresh();
    return true;
  }
  return { error, setError, working, run };
}

export function AllocationsDialog({
  eventId,
  currency,
  plannedTotalMinor,
  categories,
}: {
  eventId: string;
  currency: string;
  plannedTotalMinor: string;
  categories: { key: string; label: string; plannedMinor: string }[];
}) {
  const t = useTranslations('events.money');
  const [open, setOpen] = React.useState(false);
  const [total, setTotal] = React.useState(plannedTotalMinor);
  const [rows, setRows] = React.useState(categories);
  const { error, working, run } = useRun();
  const allocated = rows.reduce((sum, row) => sum + BigInt(row.plannedMinor || '0'), 0n);
  const left = BigInt(total || '0') - allocated;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t('editBudget')}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t('editBudget')}>
        <div className="flex flex-col gap-3 p-4 text-sm">
          {error && <Banner tone="danger">{error}</Banner>}
          <label className="flex flex-col gap-1 font-medium">
            {t('totalBudget')}
            <MoneyInput value={total} onValueChange={setTotal} currency={currency} />
          </label>
          {rows.map((row, index) => (
            <label key={row.key} className="flex items-center gap-3">
              <span className="flex-1">{row.label}</span>
              <MoneyInput
                className="w-40"
                aria-label={row.label}
                value={row.plannedMinor}
                currency={currency}
                onValueChange={(value) =>
                  setRows((current) =>
                    current.map((item, i) => (i === index ? { ...item, plannedMinor: value } : item)),
                  )
                }
              />
            </label>
          ))}
          <p className={left < 0n ? 'text-danger' : 'text-muted'}>
            {left < 0n ? t('overAllocated') : t('leftToAllocate')}:{' '}
            <MoneyText value={(left < 0n ? -left : left).toString()} currency={currency} />
          </p>
          <Button
            disabled={working}
            onClick={() =>
              void run(
                () =>
                  setAllocationsAction({
                    eventId,
                    plannedTotalMinor: total || '0',
                    allocations: rows.map((row) => ({ key: row.key, plannedMinor: row.plannedMinor || '0' })),
                  }),
                () => setOpen(false),
              )
            }
          >
            {t('save')}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}

export function AddExpenseDialog({
  eventId,
  currency,
  categories,
}: {
  eventId: string;
  currency: string;
  categories: { key: string; label: string }[];
}) {
  const t = useTranslations('events.money');
  const [open, setOpen] = React.useState(false);
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [categoryKey, setCategoryKey] = React.useState(categories[0]?.key ?? 'misc');
  const [paid, setPaid] = React.useState(true);
  const [file, setFile] = React.useState<File | null>(null);
  const { error, setError, working, run } = useRun();
  const failure = useFailure();

  async function onSave() {
    let receiptKey: string | undefined;
    if (file) {
      const mime = file.type || 'application/octet-stream';
      const started = await startExpenseReceiptAction({ eventId, mime, sizeBytes: file.size });
      if (!started.ok) return setError(failure(started));
      const put = await fetch(started.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': mime },
      }).catch(() => null);
      if (!put?.ok) return setError(t('errors.uploadFailed'));
      receiptKey = started.data.receiptKey;
    }
    await run(
      () =>
        addExpenseAction({
          eventId,
          categoryKey,
          description,
          amountMinor: amount || '0',
          paid,
          ...(receiptKey ? { receiptKey } : {}),
        }),
      () => {
        setOpen(false);
        setDescription('');
        setAmount('');
        setFile(null);
      },
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {t('addExpense')}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t('addExpense')}>
        <div className="flex flex-col gap-3 p-4 text-sm">
          {error && <Banner tone="danger">{error}</Banner>}
          <label className="flex flex-col gap-1">
            {t('expenseDescription')}
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            {t('amount')}
            <MoneyInput value={amount} onValueChange={setAmount} currency={currency} />
          </label>
          <Select
            label={t('category')}
            value={categoryKey}
            onValueChange={setCategoryKey}
            options={categories.map((row) => ({ value: row.key, label: row.label }))}
          />
          <label className="flex items-center gap-2">
            <Checkbox checked={paid} onCheckedChange={(checked) => setPaid(checked === true)} />
            {t('alreadyPaid')}
          </label>
          <label className="flex flex-col gap-1">
            {t('receiptOptional')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button disabled={working || !description.trim() || !amount} onClick={() => void onSave()}>
            {t('save')}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}

export function ExpenseActions({ expenseId, paid }: { expenseId: string; paid: boolean }) {
  const t = useTranslations('events.money');
  const { error, working, run } = useRun();
  return (
    <span className="flex items-center gap-1">
      {error && <span className="text-danger text-xs">{error}</span>}
      <Button
        variant="ghost"
        size="sm"
        disabled={working}
        onClick={() => void run(() => setExpensePaidAction({ expenseId, paid: !paid }))}
      >
        {paid ? t('markUnpaid') : t('markPaid')}
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm" disabled={working}>
            {t('delete')}
          </Button>
        }
        title={t('deleteExpenseTitle')}
        body={t('deleteBody')}
        confirmLabel={t('delete')}
        onConfirm={() => void run(() => deleteExpenseAction({ expenseId }))}
      />
    </span>
  );
}

export function AddContributionDialog({
  eventId,
  currency,
  income = false,
}: {
  eventId: string;
  currency: string;
  /** Income tab: sponsor / other income instead of pledges. */
  income?: boolean;
}) {
  const t = useTranslations('events.money');
  const kinds = income ? (['sponsor', 'other_income'] as const) : (['family', 'committee', 'member'] as const);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [kind, setKind] = React.useState<Kind>(kinds[0]);
  const [pledged, setPledged] = React.useState('');
  const [received, setReceived] = React.useState('');
  const { error, working, run } = useRun();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {income ? t('addIncome') : t('addPledge')}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={income ? t('addIncome') : t('addPledge')}>
        <div className="flex flex-col gap-3 p-4 text-sm">
          {error && <Banner tone="danger">{error}</Banner>}
          <label className="flex flex-col gap-1">
            {income ? t('incomeFrom') : t('contributorName')}
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {!income && (
            <label className="flex flex-col gap-1">
              {t('contributorPhone')}
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          )}
          <Select
            label={t('kind')}
            value={kind}
            onValueChange={(value) => setKind(value as Kind)}
            options={kinds.map((value) => ({ value, label: t(`kinds.${value}`) }))}
          />
          <label className="flex flex-col gap-1">
            {income ? t('expectedAmount') : t('pledgedAmount')}
            <MoneyInput value={pledged} onValueChange={setPledged} currency={currency} />
          </label>
          <label className="flex flex-col gap-1">
            {t('receivedSoFar')}
            <MoneyInput value={received} onValueChange={setReceived} currency={currency} />
          </label>
          <Button
            disabled={working || !name.trim()}
            onClick={() =>
              void run(
                () =>
                  addContributionAction({
                    eventId,
                    contributorName: name,
                    ...(phone.trim() ? { contributorPhone: phone.trim() } : {}),
                    kind,
                    pledgedMinor: pledged || '0',
                    receivedMinor: received || '0',
                  }),
                () => {
                  setOpen(false);
                  setName('');
                  setPhone('');
                  setPledged('');
                  setReceived('');
                },
              )
            }
          >
            {t('save')}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}

export function ContributionActions({ contributionId, currency }: { contributionId: string; currency: string }) {
  const t = useTranslations('events.money');
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const { error, working, run } = useRun();
  return (
    <span className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t('recordReceived')}
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm" disabled={working}>
            {t('delete')}
          </Button>
        }
        title={t('deleteContributionTitle')}
        body={t('deleteBody')}
        confirmLabel={t('delete')}
        onConfirm={() => void run(() => deleteContributionAction({ contributionId }))}
      />
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t('recordReceived')}>
        <div className="flex flex-col gap-3 p-4 text-sm">
          {error && <Banner tone="danger">{error}</Banner>}
          <label className="flex flex-col gap-1">
            {t('amountReceived')}
            <MoneyInput value={amount} onValueChange={setAmount} currency={currency} />
          </label>
          <Button
            disabled={working || !amount}
            onClick={() =>
              void run(
                () => recordReceivedAction({ contributionId, amountMinor: amount }),
                () => {
                  setOpen(false);
                  setAmount('');
                },
              )
            }
          >
            {t('save')}
          </Button>
        </div>
      </ResponsiveDialog>
    </span>
  );
}
