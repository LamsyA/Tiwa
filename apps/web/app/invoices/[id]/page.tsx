import { getInvoice } from '@tiwa/core';
import { buttonClasses } from '@tiwa/ui';
import { Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { InvoiceButtons } from './buttons.js';
import { InvoiceDocument } from './invoice-document.js';

/** Invoice detail (PLN-08, D-X47): branded invoice with send / paid / void and a PDF download. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageUser(`/invoices/${id}`);
  const t = await getTranslations('planner');
  const data = await getInvoice(ctx.actor, id).catch(() => null);
  if (!data) notFound();

  return (
    <AppFrame userId={ctx.actor.userId} active="invoices" title={data.invoice.number}>
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/invoices" className="text-brand-strong text-sm font-semibold hover:underline">
            ← {t('invoicesTitle')}
          </Link>
          <Link
            href={`/invoices/${id}/print`}
            className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'rounded-full' })}
          >
            <Download aria-hidden className="size-4" />
            {t('downloadPdf')}
          </Link>
        </div>
        <InvoiceDocument data={data} />
        <InvoiceButtons invoiceId={data.invoice.id} status={data.invoice.status} />
      </div>
    </AppFrame>
  );
}
