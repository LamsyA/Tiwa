import { getInvoice } from '@tiwa/core';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PrintShell } from '@/components/documents/print-shell.js';
import { requirePageUser } from '@/lib/ctx.js';
import { InvoiceDocument } from '../invoice-document.js';

/** Print view of an invoice: the browser's "Save as PDF" makes the file (D-X47). */
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageUser(`/invoices/${id}/print`);
  const t = await getTranslations('planner');
  const data = await getInvoice(ctx.actor, id).catch(() => null);
  if (!data) notFound();
  return (
    <PrintShell backHref={`/invoices/${id}`} backLabel={data.invoice.number} printLabel={t('downloadPdf')}>
      <InvoiceDocument data={data} />
    </PrintShell>
  );
}
