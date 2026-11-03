import { env, VENDOR_CATEGORIES } from '@tiwa/config';
import { getCategoryOverview, getFlagsFor } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, EmptyState, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { aiAllowed } from '@/lib/ai.js';
import { AiCompare } from './ai-compare.js';
import { CompareTable } from './compare-table.js';
import { QuoteCards } from './quote-cards.js';
import { RequestDialog } from './request-dialog.js';

const REQUEST_TONE: Record<string, 'brand' | 'success' | 'neutral' | 'warning'> = {
  OPEN: 'warning',
  QUOTED: 'success',
  DECLINED_BY_VENDOR: 'neutral',
  CLOSED: 'neutral',
};

/** Category detail (P7-T03/T05/T06): shortlist, requests, compare, decide. */
export default async function VendorCategoryPage({ params }: { params: Promise<{ id: string; category: string }> }) {
  const { id: eventId, category } = await params;
  const label = VENDOR_CATEGORIES[category as keyof typeof VENDOR_CATEGORIES];
  if (!label) notFound();
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(eventId, '/vendors');
  const t = await getTranslations('quotes');
  if (!allowed) {
    return (
      <EventFrame
        eventId={eventId}
        userId={ctx.actor.userId}
        access={access}
        active="vendors"
        title={label}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
      >
        <Banner tone="warning">{t('errors.FORBIDDEN')}</Banner>
      </EventFrame>
    );
  }
  const [overview, event] = await Promise.all([
    getCategoryOverview(ctx.actor, { eventId, category }),
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { countryCode: true } }),
  ]);
  const flags = await getFlagsFor(event.countryCode);
  const compareOn =
    overview.quotes.filter((quote) => quote.status !== 'DECLINED').length >= 2 &&
    (await aiAllowed(ctx.actor, eventId, access, 'ai.compareQuotes'));
  const unrequested = overview.shortlisted.filter(
    (row) =>
      !overview.requests.some(
        (request) => request.vendorOrgId === row.orgId && (request.status === 'OPEN' || request.status === 'QUOTED'),
      ),
  );

  const quoteViews = overview.quotes.map((quote) => ({
    id: quote.id,
    vendorName: quote.vendor?.name ?? quote.vendorOrgId,
    status: quote.status,
    items: quote.items as { name: string; qty: number; unitMinor: string }[],
    subtotalMinor: quote.subtotalMinor,
    totalMinor: quote.totalMinor,
    currency: quote.currency,
    notes: quote.notes,
    cancellationTerms: quote.cancellationTerms,
    schedule: quote.proposedSchedule as { label: string; percentBps?: number; amountMinor?: string; due: string }[],
    expiresAt: quote.expiresAt instanceof Date ? quote.expiresAt.toISOString() : String(quote.expiresAt),
  }));

  return (
    <EventFrame
      eventId={eventId}
      userId={ctx.actor.userId}
      access={access}
      active="vendors"
      title={t('categoryTitle', { category: label })}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
    >
      <div className="flex flex-col gap-4 py-4">
        <Link href={`/events/${eventId}/vendors`} className="text-brand-strong text-sm font-semibold underline-offset-4 hover:underline">
          ← {t('backToEvent')}
        </Link>
        <p className="text-muted text-sm">{t('categoryBody')}</p>

        <h2 className="font-display text-lg font-bold tracking-tight">{t('requestHeading')}</h2>
        {unrequested.length === 0 ? (
          <p className="text-muted text-sm">{t('noShortlist', { category: label })}</p>
        ) : (
          <RequestDialog eventId={eventId} category={category} vendors={unrequested} />
        )}

        {overview.requests.length > 0 && (
          <>
            <h2 className="font-display text-lg font-bold tracking-tight">{t('requestsHeading')}</h2>
            <ul className="flex flex-col gap-2">
              {overview.requests.map((request) => (
                <li
                  key={request.id}
                  className="border-border/70 bg-surface flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
                >
                  <span className="font-medium">{request.orgName}</span>
                  <StatusPill tone={REQUEST_TONE[request.status] ?? 'neutral'}>
                    {t(`requestStatus.${request.status}`)}
                  </StatusPill>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="font-display text-lg font-bold tracking-tight">{t('quotesHeading')}</h2>
        {overview.quotes.length === 0 ? (
          <EmptyState title={t('noQuotes')} body={t('compareHint')} />
        ) : (
          <>
            {compareOn && <AiCompare eventId={eventId} category={category} categoryLabel={label} />}
            <CompareTable eventId={eventId} category={category} quotes={quoteViews} />
            <QuoteCards
              eventId={eventId}
              category={label}
              heldEnabled={flags['payments.held']}
              onlineEnabled={env.PAYMENT_PROVIDER !== 'fake'}
              quotes={quoteViews}
            />
          </>
        )}
      </div>
    </EventFrame>
  );
}
