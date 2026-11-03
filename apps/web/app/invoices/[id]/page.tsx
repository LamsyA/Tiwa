import { getInvoice } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { MoneyText, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { InvoiceButtons } from './buttons.js';

const TONE = { DRAFT: 'neutral', SENT: 'warning', PAID: 'success', VOID: 'neutral' } as const;

/** Invoice detail (PLN-08): a clean, printable invoice with send / paid / void. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageUser(`/invoices/${id}`);
  const t = await getTranslations('planner');
  const data = await getInvoice(ctx.actor, id).catch(() => null);
  if (!data) notFound();
  const { invoice, client } = data;
  const org = await prisma.organization.findUnique({
    where: { id: invoice.orgId },
    select: { name: true, city: true },
  });
  const body = invoice.items as { items: { label: string; qty: number; unitMinor: string }[]; notes?: string | null };
  const date = (value: Date | string | null) =>
    value ? new Date(value).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';

  return (
    <AppFrame userId={ctx.actor.userId} active="invoices" title={invoice.number}>
      <div className="flex flex-col gap-4 py-2">
        <Link href="/invoices" className="text-brand-strong text-sm font-semibold hover:underline print:hidden">
          ← {t('invoicesTitle')}
        </Link>
        <article className="border-border/70 bg-surface relative overflow-hidden rounded-3xl border shadow-[var(--shadow-1)] print:border-0 print:shadow-none">
          <div aria-hidden className="h-1.5 bg-[linear-gradient(90deg,var(--brand),var(--accent))]" />
          <div className="flex flex-col gap-6 p-5 sm:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-muted text-xs font-semibold tracking-widest uppercase">{t('invoiceWord')}</p>
                <h1 className="font-display text-2xl font-bold">{invoice.number}</h1>
                <p className="text-muted text-sm">
                  {org?.name}
                  {org?.city ? ` · ${org.city}` : ''}
                </p>
              </div>
              <StatusPill tone={TONE[invoice.status as keyof typeof TONE] ?? 'neutral'}>
                {t(`status${invoice.status}`)}
              </StatusPill>
            </header>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted text-xs">{t('billTo')}</dt>
                <dd className="font-medium">{client?.name ?? '—'}</dd>
                {client?.email && <dd className="text-muted">{client.email}</dd>}
              </div>
              <div>
                <dt className="text-muted text-xs">{t('issued')}</dt>
                <dd className="font-medium">{date(invoice.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">{t('dueLabel')}</dt>
                <dd className="font-medium">{date(invoice.dueAt)}</dd>
              </div>
            </dl>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted border-border/70 border-b text-left text-xs">
                  <th className="py-2 font-medium">{t('itemsLabel')}</th>
                  <th className="py-2 text-right font-medium">{t('qtyLabel')}</th>
                  <th className="py-2 text-right font-medium">{t('unitLabel')}</th>
                  <th className="py-2 text-right font-medium">{t('amountLabel')}</th>
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {body.items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-2.5">{it.label}</td>
                    <td className="py-2.5 text-right tabular-nums">{it.qty}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <MoneyText value={it.unitMinor} currency={invoice.currency} />
                    </td>
                    <td className="py-2.5 text-right font-medium tabular-nums">
                      <MoneyText
                        value={(BigInt(it.qty) * BigInt(it.unitMinor)).toString()}
                        currency={invoice.currency}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bg-surface-2 flex items-center justify-between rounded-2xl px-4 py-3">
              <span className="text-sm font-medium">{t('totalLabel')}</span>
              <span className="font-display text-2xl font-bold">
                <MoneyText value={invoice.totalMinor} currency={invoice.currency} />
              </span>
            </div>
            {body.notes && <p className="text-muted text-sm whitespace-pre-line">{body.notes}</p>}
          </div>
        </article>
        <InvoiceButtons invoiceId={invoice.id} status={invoice.status} />
      </div>
    </AppFrame>
  );
}
