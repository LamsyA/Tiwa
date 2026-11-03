import type { getInvoice } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { DateText } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { BrandedDocument } from '@/components/documents/branded-document.js';

const TONE = { DRAFT: 'neutral', SENT: 'warning', PAID: 'success', VOID: 'neutral' } as const;

/** The invoice as a branded document, shared by the page and its print view. */
export async function InvoiceDocument({ data }: { data: Awaited<ReturnType<typeof getInvoice>> }) {
  const t = await getTranslations('planner');
  const { invoice, client } = data;
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: invoice.orgId },
    select: { id: true, name: true, city: true, logoKey: true },
  });
  const body = invoice.items as { items: { label: string; qty: number; unitMinor: string }[]; notes?: string | null };
  return (
    <BrandedDocument
      org={{ id: org.id, name: org.name, city: org.city, hasLogo: org.logoKey !== null }}
      kindLabel={t('invoiceWord')}
      heading={invoice.number}
      status={{ label: t(`status${invoice.status}`), tone: TONE[invoice.status as keyof typeof TONE] ?? 'neutral' }}
      parties={[
        { label: t('billTo'), value: client?.name ?? '—', sub: client?.email ?? client?.phone },
        { label: t('issued'), value: <DateText value={invoice.createdAt} format="date" /> },
        { label: t('dueLabel'), value: <DateText value={invoice.dueAt} format="date" /> },
      ]}
      lines={body.items}
      currency={invoice.currency}
      totalMinor={invoice.totalMinor}
      notes={body.notes}
      labels={{
        item: t('itemsLabel'),
        qty: t('qtyLabel'),
        unit: t('unitLabel'),
        amount: t('amountLabel'),
        total: t('totalLabel'),
      }}
    />
  );
}
