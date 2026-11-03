import { currencyForCountry } from '@tiwa/config';
import { invoiceReminders, listClients, listInvoices, listMyOrgs } from '@tiwa/core';
import { EmptyState, MoneyText, StatusPill } from '@tiwa/ui';
import { ChevronRight, Receipt } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { InvoiceForm } from './form.js';

const TONE = { DRAFT: 'neutral', SENT: 'warning', PAID: 'success', VOID: 'neutral' } as const;

/** Planner invoices (PLN-08, lean offline): totals, due soon, every invoice, create. */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const ctx = await requirePageUser('/invoices');
  const t = await getTranslations('planner');
  const { client } = await searchParams;
  const orgs = await listMyOrgs(ctx.actor.userId);
  const plannerOrg = orgs.find((r) => r.org.kind === 'PLANNER')?.org;
  if (!plannerOrg) {
    return (
      <AppFrame userId={ctx.actor.userId} active="invoices" title={t('invoicesTitle')}>
        <EmptyState icon={<Receipt className="size-8" aria-hidden />} title={t('plannerOnly')} body="" />
      </AppFrame>
    );
  }
  const [invoices, reminders, clients] = await Promise.all([
    listInvoices(ctx.actor, plannerOrg.id),
    invoiceReminders(ctx.actor, plannerOrg.id),
    listClients(ctx.actor, { orgId: plannerOrg.id }),
  ]);
  const currency = invoices[0]?.currency ?? currencyForCountry();
  const names = new Map(clients.map((row) => [row.id, row.name]));
  const sum = (status: string) =>
    invoices
      .filter((row) => row.status === status && row.currency === currency)
      .reduce((total, row) => total + BigInt(row.totalMinor), 0n)
      .toString();

  return (
    <AppFrame userId={ctx.actor.userId} active="invoices" title={t('invoicesTitle')}>
      <div className="flex flex-col gap-5 py-2">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-muted text-sm">{t('invoicesBody')}</p>
          </div>
          <InvoiceForm
            orgId={plannerOrg.id}
            currency={currency}
            clients={clients.map((row) => ({ id: row.id, name: row.name }))}
            {...(client ? { defaultClientId: client } : {})}
          />
        </header>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              ['outstanding', sum('SENT')],
              ['paid', sum('PAID')],
              ['drafts', sum('DRAFT')],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="border-border/70 bg-surface rounded-2xl border p-4">
              <dt className="text-muted text-xs font-medium">{t(`invoiceTotals.${key}`)}</dt>
              <dd className="font-display mt-1 text-2xl font-bold">
                <MoneyText value={value} currency={currency} />
              </dd>
            </div>
          ))}
        </dl>

        {reminders.length > 0 && (
          <section className="border-warning/50 bg-warning/5 rounded-3xl border p-4">
            <h2 className="mb-2 text-sm font-semibold">{t('remindersHeading')}</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {reminders.map((r) => (
                <li key={r.id}>
                  <Link href={`/invoices/${r.id}`} className="text-brand-strong font-medium hover:underline">
                    {r.number}
                  </Link>
                  <span className="text-muted"> · {r.dueAt ? new Date(r.dueAt).toLocaleDateString() : '—'}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {invoices.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-8" aria-hidden />}
            title={t('emptyInvoices')}
            body={t('emptyInvoicesBody')}
          />
        ) : (
          <ul className="divide-border/60 border-border/70 bg-surface flex flex-col divide-y overflow-hidden rounded-3xl border">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/invoices/${inv.id}`}
                  className="hover:bg-surface-2/60 flex items-center gap-3 px-4 py-3 transition"
                >
                  <span className="bg-brand/10 text-brand-strong grid size-10 shrink-0 place-items-center rounded-2xl">
                    <Receipt className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {inv.number}
                      {inv.clientId && names.get(inv.clientId) ? (
                        <span className="text-muted font-normal"> · {names.get(inv.clientId)}</span>
                      ) : null}
                    </p>
                    <p className="text-muted text-xs">
                      {inv.dueAt
                        ? t('dueOn', { date: new Date(inv.dueAt).toLocaleDateString('en', { dateStyle: 'medium' }) })
                        : '—'}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">
                    <MoneyText value={inv.totalMinor} currency={inv.currency} />
                  </span>
                  <StatusPill tone={TONE[inv.status as keyof typeof TONE] ?? 'neutral'}>
                    {t(`status${inv.status}`)}
                  </StatusPill>
                  <ChevronRight className="text-muted hidden size-4 sm:block" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}
