import { getEnquiry, stageForBooking, stageForQuote, type OrderStage } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { MoneyText } from '@tiwa/ui';
import { CalendarDays, MapPin, MessageSquareText, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { OrderTimeline } from '@/components/orders/order-timeline.js';
import { requirePageUser } from '@/lib/ctx.js';
import { QuoteBuilder } from './quote-builder.js';

/** Quote builder (QTE-02, P7-T04): order timeline and brief on top, itemised builder below. */
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

  // Where this order stands (D-X35): booking if one exists, else the newest quote, else the request.
  const [latest, request] = await Promise.all([
    prisma.quote.findFirst({
      where: { requestId: enquiry.request.id, status: { not: 'DRAFT' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    }),
    prisma.quoteRequest.findUnique({
      where: { id: enquiry.request.id },
      select: { createdById: true },
    }),
  ]);
  const booking = latest
    ? await prisma.booking.findUnique({
        where: { quoteId: latest.id },
        select: { status: true, totalMinor: true, currency: true },
      })
    : null;
  const client = request
    ? await prisma.user.findUnique({ where: { id: request.createdById }, select: { name: true } })
    : null;
  const stage: OrderStage = booking
    ? stageForBooking(booking.status)
    : latest
      ? stageForQuote(latest.status)
      : enquiry.request.status === 'OPEN'
        ? 'requested'
        : 'closed';

  const facts = [
    brief.startsAt ? { icon: CalendarDays, label: t('briefDate'), value: brief.startsAt.slice(0, 10) } : null,
    brief.venue ? { icon: MapPin, label: t('briefVenue'), value: brief.venue } : null,
    typeof brief.expectedGuests === 'number'
      ? { icon: Users, label: t('briefGuests'), value: String(brief.expectedGuests) }
      : null,
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null);

  return (
    <AppFrame userId={ctx.actor.userId} active="orders" title={t('builderTitle')}>
      <div className="flex flex-col gap-6 py-4">
        <OrderTimeline
          stage={stage}
          side="vendor"
          title={brief.eventName ?? enquiry.event.name}
          subtitle={client?.name ? t('briefFrom', { name: client.name }) : undefined}
          aside={
            booking ? (
              <span className="font-display text-2xl font-bold">
                <MoneyText value={booking.totalMinor.toString()} currency={booking.currency} />
              </span>
            ) : brief.budgetMaxMinor ? (
              <span className="text-sm">
                <span className="text-muted block text-xs">{t('briefBudget')}</span>
                <span className="font-semibold">
                  <MoneyText value={brief.budgetMaxMinor} currency={enquiry.event.currency} />
                </span>
              </span>
            ) : undefined
          }
        />

        <section
          aria-label={t('briefHeading')}
          className="border-border/70 bg-surface flex flex-col gap-4 rounded-3xl border p-5 sm:p-6"
        >
          <h2 className="font-display text-lg font-bold">{t('briefHeading')}</h2>
          {facts.length > 0 && (
            <dl className="grid gap-3 sm:grid-cols-3">
              {facts.map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-surface-2 flex items-center gap-3 rounded-2xl p-3">
                  <span className="bg-brand-soft text-brand-strong flex size-9 shrink-0 items-center justify-center rounded-xl">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <dt className="text-muted text-xs">{label}</dt>
                    <dd className="truncate font-semibold">{value}</dd>
                  </span>
                </div>
              ))}
            </dl>
          )}
          {brief.notes && (
            <p className="bg-surface-2 flex gap-3 rounded-2xl p-4 text-sm">
              <MessageSquareText aria-hidden className="text-muted mt-0.5 size-4 shrink-0" />
              <span className="whitespace-pre-line">{brief.notes}</span>
            </p>
          )}
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
