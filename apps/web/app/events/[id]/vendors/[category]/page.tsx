import { env, PLANNING_CATEGORY, serviceLabel, isQuoteCategory } from '@tiwa/config';
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
import { ProposalCards } from './proposal-cards.js';
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
  if (!isQuoteCategory(category)) notFound();
  const planning = category === PLANNING_CATEGORY;
  const label = serviceLabel(category);
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(eventId, '/vendors');
  const t = await getTranslations('quotes');
  const tp = await getTranslations('proposals');
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
      title={planning ? tp('pageTitle') : t('categoryTitle', { category: label })}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
    >
      {planning ? (
        <div className="flex flex-col gap-6 py-4">
          <Link
            href={`/events/${eventId}/vendors`}
            className="text-brand-strong w-fit text-sm font-semibold underline-offset-4 hover:underline"
          >
            ← {t('backToEvent')}
          </Link>
          <section className="border-border/70 bg-surface flex flex-col gap-4 rounded-3xl border p-5 shadow-[var(--shadow-1)] sm:flex-row sm:items-center sm:p-6">
            <div className="flex-1">
              <h2 className="font-display text-2xl font-bold tracking-tight">{tp('introTitle')}</h2>
              <p className="text-muted mt-1 max-w-2xl text-sm">{tp('pageBody')}</p>
            </div>
            <Link
              href={`/planners?eventId=${eventId}`}
              className="bg-brand-strong text-on-brand inline-flex h-11 shrink-0 items-center justify-center rounded-2xl px-5 text-sm font-semibold shadow-[var(--shadow-1)] transition hover:brightness-110"
            >
              {tp('findMore')}
            </Link>
          </section>

          {unrequested.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="font-display text-lg font-bold tracking-tight">{tp('shortlistHeading')}</h3>
              <RequestDialog eventId={eventId} category={category} vendors={unrequested} />
            </section>
          )}

          {overview.requests.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="font-display text-lg font-bold tracking-tight">{tp('requestsHeading')}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {overview.requests.map((request) => (
                  <li
                    key={request.id}
                    className="border-border/70 bg-surface flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
                  >
                    <span className="truncate font-medium">{request.orgName}</span>
                    <StatusPill tone={REQUEST_TONE[request.status] ?? 'neutral'}>
                      {tp(`requestStatus.${request.status}` as 'requestStatus.OPEN')}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="font-display text-lg font-bold tracking-tight">{tp('proposalsHeading')}</h3>
            {overview.quotes.length === 0 ? (
              <EmptyState title={tp('emptyTitle')} body={tp('emptyBody')} />
            ) : (
              <>
                {compareOn && <AiCompare eventId={eventId} category={category} categoryLabel={label} />}
                <ProposalCards
                  eventId={eventId}
                  heldEnabled={flags['payments.held']}
                  onlineEnabled={env.PAYMENT_PROVIDER !== 'fake'}
                  proposals={quoteViews}
                />
              </>
            )}
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-4 py-4">
          <Link
            href={`/events/${eventId}/vendors`}
            className="text-brand-strong text-sm font-semibold underline-offset-4 hover:underline"
          >
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
      )}
    </EventFrame>
  );
}
