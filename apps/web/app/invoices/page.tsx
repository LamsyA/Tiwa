import { invoiceReminders, listInvoices, listMyOrgs } from '@tiwa/core';
import { Badge, Card, EmptyState } from '@tiwa/ui';
import { Receipt } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { InvoiceForm } from './form.js';

/** Planner invoices (PLN-08, P10-T07, lean offline): list, reminders, create. */
export default async function InvoicesPage() {
  const ctx = await requirePageUser('/invoices');
  const t = await getTranslations('planner');
  const orgs = await listMyOrgs(ctx.actor.userId);
  const plannerOrg = orgs.find((r) => r.org.kind === 'PLANNER')?.org;
  if (!plannerOrg) {
    return (
      <AppFrame userId={ctx.actor.userId} active="invoices" title={t('invoicesTitle')}>
        <EmptyState icon={<Receipt className="size-8" aria-hidden />} title={t('emptyInvoices')} body="" />
      </AppFrame>
    );
  }
  const [invoices, reminders] = await Promise.all([
    listInvoices(ctx.actor, plannerOrg.id),
    invoiceReminders(ctx.actor, plannerOrg.id),
  ]);
  return (
    <AppFrame userId={ctx.actor.userId} active="invoices" title={t('invoicesTitle')}>
      <div className="flex flex-col gap-4 py-2">
        {reminders.length > 0 && (
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">{t('remindersHeading')}</h2>
            <ul className="flex flex-col gap-1">
              {reminders.map((r) => (
                <li key={r.id} className="text-sm">
                  <Link href={`/invoices/${r.id}`} className="text-brand-strong font-medium">
                    {r.number}
                  </Link>
                  <span className="text-muted"> · {r.dueAt ? new Date(r.dueAt).toLocaleDateString() : '—'}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <InvoiceForm orgId={plannerOrg.id} />
        {invoices.length === 0 ? (
          <EmptyState icon={<Receipt className="size-8" aria-hidden />} title={t('emptyInvoices')} body="" />
        ) : (
          <ul className="flex flex-col gap-2">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Card className="flex items-center justify-between gap-2 p-3">
                  <Link href={`/invoices/${inv.id}`} className="font-medium">
                    {inv.number}
                  </Link>
                  <Badge>{t(`status${inv.status}`)}</Badge>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}
