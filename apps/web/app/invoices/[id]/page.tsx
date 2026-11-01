import { getInvoice } from '@tiwa/core';
import { Badge, Card, buttonClasses } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { InvoiceButtons } from './buttons.js';

/** Invoice detail (P10-T07): branded totals, send / paid / void, print-ready. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageUser(`/invoices/${id}`);
  const t = await getTranslations('planner');
  let data;
  try {
    data = await getInvoice(ctx.actor, id);
  } catch {
    notFound();
  }
  const body = data.invoice.items as {
    items: { label: string; qty: number; unitMinor: string }[];
    notes?: string | null;
  };
  return (
    <AppFrame userId={ctx.actor.userId} active="invoices" title={data.invoice.number}>
      <div className="flex flex-col gap-4 py-2">
        <Card className="flex items-center justify-between gap-2 p-4">
          <div>
            <h2 className="text-lg font-semibold">{data.invoice.number}</h2>
            <p className="text-muted text-sm">{data.client?.name ?? '—'}</p>
          </div>
          <Badge>{t(`status${data.invoice.status}`)}</Badge>
        </Card>
        <Card className="p-4">
          <ul className="flex flex-col gap-2">
            {body.items.map((it, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>
                  {it.label} × {it.qty}
                </span>
                <span>{it.unitMinor}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 font-semibold">
            {t('totalLabel')}: {data.invoice.totalMinor} {data.invoice.currency}
          </p>
        </Card>
        <InvoiceButtons invoiceId={data.invoice.id} status={data.invoice.status} />
        <button type="button" onClick={() => window.print()} className={buttonClasses({ variant: 'secondary' })}>
          {t('print')}
        </button>
      </div>
    </AppFrame>
  );
}
