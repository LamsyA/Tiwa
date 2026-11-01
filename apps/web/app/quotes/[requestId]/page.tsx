import { getEnquiry } from '@tiwa/core';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { QuoteBuilder } from './quote-builder.js';

/** Quote builder (QTE-02, P7-T04): brief on top, itemised builder below. */
export default async function QuoteBuilderPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const ctx = await requirePageUser(`/quotes/${requestId}`);
  const t = await getTranslations('quotes');
  const enquiry = await getEnquiry(ctx.actor, { requestId }).catch(() => null);
  if (!enquiry) notFound();
  const brief = enquiry.request.brief as {
    eventName?: string;
    eventType?: string;
    startsAt?: string | null;
    timezone?: string;
    venue?: string | null;
    expectedGuests?: number | null;
    notes?: string;
    budgetMaxMinor?: string;
  };

  return (
    <AppFrame userId={ctx.actor.userId} active="quotes" title={t('builderTitle')}>
      <div className="flex flex-col gap-4 py-4">
        <section aria-label={t('briefHeading')} className="border-border rounded-lg border p-4 text-sm">
          <h2 className="font-medium">{t('briefHeading')}</h2>
          <dl className="text-muted mt-2 flex flex-col gap-1">
            <div className="flex gap-2"><dt>{brief.eventName ?? enquiry.event.name}</dt></div>
            {brief.venue && <div className="flex gap-2"><dd>{brief.venue}</dd></div>}
            {typeof brief.expectedGuests === 'number' && (
              <div className="flex gap-2"><dd>{brief.expectedGuests}</dd></div>
            )}
            {brief.notes && <div className="flex gap-2"><dd>{brief.notes}</dd></div>}
          </dl>
        </section>
        <QuoteBuilder
          requestId={enquiry.request.id}
          eventId={enquiry.request.eventId}
          vendorOrgId={enquiry.request.vendorOrgId}
          currency={enquiry.event.currency}
          existing={enquiry.quotes}
        />
      </div>
    </AppFrame>
  );
}
