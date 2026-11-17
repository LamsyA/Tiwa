import { PLANNING_CATEGORY } from '@tiwa/config';
import { getEnquiry, quoteHistory, stageForBooking, stageForQuote, type OrderStage } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, MoneyText } from '@tiwa/ui';
import { CalendarDays, MapPin, MessageSquareText, RefreshCw, Users, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { OrderTimeline } from '@/components/orders/order-timeline.js';
import { requirePageUser } from '@/lib/ctx.js';
import { QuoteBuilder } from './quote-builder.js';
import { ProposalHistory } from '@/components/quotes/proposal-history.js';
import { Lock } from 'lucide-react';

/** Quote builder (QTE-02, P7-T04): order timeline and brief on top, itemised builder below. */
export default async function QuoteBuilderPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const ctx = await requirePageUser(`/quotes/${requestId}`);
  const t = await getTranslations('quotes');
  const enquiry = await getEnquiry(ctx.actor, { requestId }).catch(() => null);
  if (!enquiry) notFound();
  const proposal = enquiry.request.category === PLANNING_CATEGORY;
  // D-X66: a quote the client sent back is revised in place, not re-created.
  const revising = enquiry.quotes.find((quote) => quote.status === 'CHANGES_REQUESTED') ?? null;
  // D-X67: the newest sent version and its history; once it's with the client
  // (and not sent back), the page is read-only.
  const current = enquiry.quotes.find((quote) => quote.status !== 'DRAFT') ?? null;
  const history = current ? await quoteHistory(ctx.actor, { quoteId: current.id }).catch(() => null) : null;
  const locked = !revising && enquiry.request.status !== 'OPEN' && current !== null;
  const packages = await prisma.servicePackage.findMany({
    where: { orgId: enquiry.request.vendorOrgId, active: true },
    orderBy: { priceMinor: 'asc' },
    take: 12,
  });
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

  // D-X77: warn before quoting a day this business is already booked or blocked.
  const day = brief.startsAt
    ? new Date(
        `${new Intl.DateTimeFormat('en-CA', { timeZone: brief.timezone ?? 'UTC' }).format(new Date(brief.startsAt))}T00:00:00Z`,
      )
    : null;
  const dayTaken =
    day && !locked && !proposal
      ? (await prisma.availabilityBlock.count({ where: { orgId: enquiry.request.vendorOrgId, date: day } })) > 0
      : false;

  const facts = [
    brief.startsAt
      ? {
          icon: CalendarDays,
          label: t('briefDate'),
          value: new Intl.DateTimeFormat('en', {
            weekday: 'short',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: brief.timezone ?? 'UTC',
          }).format(new Date(brief.startsAt)),
        }
      : null,
    brief.venue ? { icon: MapPin, label: t('briefVenue'), value: brief.venue } : null,
    typeof brief.expectedGuests === 'number'
      ? { icon: Users, label: t('briefGuests'), value: String(brief.expectedGuests) }
      : null,
    brief.budgetMaxMinor && brief.budgetMaxMinor !== '0'
      ? {
          icon: Wallet,
          label: t('briefBudgetFact'),
          value: <MoneyText value={brief.budgetMaxMinor} currency={enquiry.event.currency} />,
        }
      : null,
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null);

  return (
    <AppFrame
      userId={ctx.actor.userId}
      active={proposal ? 'quotes' : 'orders'}
      title={proposal ? t('proposalBuilderTitle') : t('builderTitle')}
    >
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
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

        {history && history.versions.length > 0 && (
          <ProposalHistory
            history={history}
            kind={proposal ? 'proposal' : 'quote'}
            viewer="vendor"
            counterpart={client?.name ?? t('theClient')}
            defaultOpen={locked}
          />
        )}

        {revising?.changeRequest && (
          <section className="border-warning/40 bg-warning/10 flex flex-col gap-2 rounded-3xl border p-5 sm:p-6">
            <p className="text-warning flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
              <RefreshCw aria-hidden className="size-4" />
              {t('changes.bannerTitle')}
            </p>
            <blockquote className="font-display text-lg leading-snug font-semibold whitespace-pre-line">
              “{revising.changeRequest}”
            </blockquote>
            <p className="text-muted text-sm">
              {t('changes.bannerBody', { kind: proposal ? t('changes.kindProposal') : t('changes.kindQuote') })}
            </p>
          </section>
        )}

        {locked ? (
          <section className="border-border/70 bg-surface flex items-start gap-4 rounded-3xl border p-5 shadow-[var(--shadow-1)] sm:p-6">
            <span className="bg-surface-2 flex size-11 shrink-0 items-center justify-center rounded-2xl">
              <Lock aria-hidden className="text-muted size-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold tracking-tight">
                {t('lockedTitle', { kind: proposal ? t('changes.kindProposal') : t('changes.kindQuote') })}
              </h2>
              <p className="text-muted mt-1 text-sm">{t('lockedBody')}</p>
            </div>
          </section>
        ) : (
          <>
            {dayTaken && <Banner tone="warning">{t('dayTakenWarning')}</Banner>}
            <QuoteBuilder
              requestId={enquiry.request.id}
              eventId={enquiry.request.eventId}
              vendorOrgId={enquiry.request.vendorOrgId}
              currency={enquiry.event.currency}
              existing={enquiry.quotes}
              proposal={proposal}
              revise={
                revising
                  ? {
                      id: revising.id,
                      items: revising.items as { name: string; qty: number; unitMinor: string }[],
                      taxBps: revising.taxBps,
                      serviceBps: revising.serviceBps,
                      travelFeeMinor: revising.travelFeeMinor,
                      notes: revising.notes,
                      cancellationTerms: revising.cancellationTerms,
                      schedule: revising.proposedSchedule as { label: string; percentBps?: number; due: string }[],
                      expiresAt: new Date(revising.expiresAt).toISOString(),
                    }
                  : null
              }
              budgetMinor={brief.budgetMaxMinor ?? null}
              packages={packages
                .filter((row) => row.currency === enquiry.event.currency)
                .map((row) => ({
                  id: row.id,
                  name: row.name,
                  description: row.description,
                  priceMinor: row.priceMinor?.toString() ?? null,
                  includes: row.includes,
                }))}
            />
          </>
        )}
      </div>
    </AppFrame>
  );
}
