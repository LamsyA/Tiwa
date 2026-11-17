import {
  listEnquiries,
  listSentQuotes,
  listMyOrgs,
  listPendingChanges,
  listPendingOfflinePayments,
  listSiteVisits,
  listVendorBookingMoney,
} from '@tiwa/core';
import { PLANNING_CATEGORY, serviceLabel } from '@tiwa/config';
import { Banner, EmptyState, MoneyText, StatusPill, buttonClasses } from '@tiwa/ui';
import { ArrowRight, History, Inbox } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ChangeCards } from './change-cards.js';
import { BookingMoneyList } from './booking-money.js';
import { PaymentCards } from './payment-cards.js';
import { DeclineEnquiry } from './decline-enquiry.js';
import { SentToast } from '@/components/quotes/sent-toast.js';
import { Suspense } from 'react';
import { VisitCards } from './visit-cards.js';

/** Vendor quote inbox (VND-01, P7-T04): open briefs with status. Full quotes arrive with P7-T05. */
export default async function QuotesInboxPage() {
  const ctx = await requirePageUser('/quotes');
  const t = await getTranslations('quotes');
  // A section that fails to load says so, instead of quietly looking empty.
  const load = { failed: false };
  const fallback =
    <T,>(value: T) =>
    (error: unknown) => {
      console.error('quotes inbox section failed', error);
      load.failed = true;
      return value;
    };
  const enquiries = await listEnquiries(ctx.actor).catch(() => null);
  const sentQuotes = await listSentQuotes(ctx.actor).catch(() => []);
  const orgs = enquiries === null ? [] : await listMyOrgs(ctx.actor.userId).catch(() => []);
  // D-X64: planner orgs receive proposal requests here too.
  const vendorOrgIds = (orgs ?? [])
    .filter((row) => row.org.kind === 'VENDOR' || row.org.kind === 'PLANNER')
    .map((row) => row.org.id);
  const plannerOnly = (orgs ?? []).length > 0 && (orgs ?? []).every((row) => row.org.kind === 'PLANNER');
  const visits = (
    await Promise.all(
      vendorOrgIds.map((orgId) => listSiteVisits(ctx.actor, { vendorOrgId: orgId }).catch(fallback([]))),
    )
  )
    .flat()
    .map((row) => ({
      id: row.id,
      eventId: 'eventId' in row ? ((row as { eventId?: string | null }).eventId ?? null) : null,
      proposedTimes: row.proposedTimes.map((time) => (time instanceof Date ? time.toISOString() : String(time))),
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
      status: row.status,
      notes: row.notes,
      event: (() => {
        const withEvent = row as unknown as { event?: { name: string; startsAt: Date | null } | null };
        return withEvent.event
          ? { name: withEvent.event.name, startsAt: withEvent.event.startsAt?.toISOString() ?? null }
          : null;
      })(),
    }));
  const changes = (
    await Promise.all(
      vendorOrgIds.map((orgId) => listPendingChanges(ctx.actor, { vendorOrgId: orgId }).catch(fallback([]))),
    )
  ).flat();
  const payments = (
    await Promise.all(
      vendorOrgIds.map((orgId) => listPendingOfflinePayments(ctx.actor, { vendorOrgId: orgId }).catch(fallback([]))),
    )
  ).flat();
  const vendorBookings = (
    await Promise.all(
      vendorOrgIds.map((orgId) => listVendorBookingMoney(ctx.actor, { vendorOrgId: orgId }).catch(fallback([]))),
    )
  ).flat();

  return (
    <AppFrame userId={ctx.actor.userId} active="quotes" title={plannerOnly ? t('proposalInboxTitle') : t('inboxTitle')}>
      <div className="flex flex-col gap-6 py-4">
        <p className="text-muted text-sm">{plannerOnly ? t('proposalInboxBody') : t('inboxBody')}</p>
        <Suspense fallback={null}>
          <SentToast />
        </Suspense>
        {load.failed && <Banner tone="warning">{t('sectionFailed')}</Banner>}
        {/* New requests first (D-X65): the reason the inbox exists. */}
        <section aria-labelledby="requests-heading" className="flex flex-col gap-3">
          <h2 id="requests-heading" className="font-display flex items-center gap-2 text-lg font-bold tracking-tight">
            {t('requestsTitle')}
            {enquiries && enquiries.length > 0 && (
              <span className="bg-brand-strong text-on-brand rounded-full px-2 py-0.5 text-xs font-semibold">
                {enquiries.length}
              </span>
            )}
          </h2>
          {!enquiries || enquiries.length === 0 ? (
            <EmptyState icon={<Inbox className="size-8" aria-hidden />} title={t('noEnquiries')} body="" />
          ) : (
            <ul className="flex flex-col gap-4">
              {enquiries.map((row) => {
                const brief = row.brief as {
                  eventName?: string;
                  venue?: string | null;
                  expectedGuests?: number | null;
                  startsAt?: string | null;
                  timezone?: string;
                  notes?: string;
                  budgetMaxMinor?: string;
                  currency?: string;
                };
                const proposal = row.category === PLANNING_CATEGORY;
                const when = brief.startsAt
                  ? new Intl.DateTimeFormat('en', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: brief.timezone ?? 'UTC',
                    }).format(new Date(brief.startsAt))
                  : null;
                const chips = [
                  serviceLabel(row.category),
                  when,
                  typeof brief.expectedGuests === 'number'
                    ? t('enquiry.guests', { count: brief.expectedGuests })
                    : null,
                  brief.venue,
                ].filter((chip): chip is string => Boolean(chip));
                const budget = brief.budgetMaxMinor && brief.budgetMaxMinor !== '0' ? brief.budgetMaxMinor : null;
                const change = row.changeRequest;
                return (
                  <li
                    key={row.id}
                    className="border-border/70 bg-surface relative overflow-hidden rounded-3xl border shadow-[var(--shadow-1)] transition hover:shadow-[var(--shadow-2)]"
                  >
                    <span
                      aria-hidden
                      className={`absolute inset-y-0 left-0 w-1 ${change ? 'bg-warning' : 'bg-brand-strong'}`}
                    />
                    <div className="flex flex-col gap-4 p-5 pl-6 sm:flex-row sm:items-start sm:p-6 sm:pl-7">
                      <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display min-w-0 truncate text-xl font-bold tracking-tight">
                            {brief.eventName ?? row.event.name}
                          </h3>
                          {change ? (
                            <StatusPill tone="warning">{t('changes.pill')}</StatusPill>
                          ) : (
                            <StatusPill tone={row.status === 'OPEN' ? 'brand' : 'neutral'}>
                              {t.has(`enquiry.status.${row.status}`)
                                ? t(`enquiry.status.${row.status}` as 'enquiry.status.OPEN')
                                : row.status}
                            </StatusPill>
                          )}
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                          {chips.map((chip) => (
                            <li key={chip} className="bg-surface-2 rounded-full px-3 py-1 text-xs font-medium">
                              {chip}
                            </li>
                          ))}
                        </ul>
                        {change?.message && (
                          <div className="border-warning/30 bg-warning/10 rounded-2xl border px-4 py-3">
                            <p className="text-warning text-xs font-semibold tracking-[0.12em] uppercase">
                              {t('changes.fromClient')}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{change.message}</p>
                          </div>
                        )}
                        {brief.notes && (
                          <p className="bg-surface-2/70 rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line">
                            {brief.notes}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/quotes/${row.id}`} className={buttonClasses({ className: 'rounded-2xl' })}>
                            {change
                              ? proposal
                                ? t('changes.reviseProposal')
                                : t('changes.reviseQuote')
                              : row.status === 'OPEN'
                                ? proposal
                                  ? t('proposalBuilderTitle')
                                  : t('builderTitle')
                                : t('enquiry.open')}
                          </Link>
                          {row.status === 'OPEN' && <DeclineEnquiry requestId={row.id} />}
                        </div>
                      </div>
                      <div className="bg-surface-2 flex shrink-0 flex-col gap-0.5 rounded-2xl px-5 py-4 sm:min-w-48 sm:text-right">
                        <span className="text-muted text-xs font-semibold tracking-[0.12em] uppercase">
                          {t('briefBudgetFact')}
                        </span>
                        {budget ? (
                          <span className="font-display text-2xl font-bold tracking-tight">
                            <MoneyText value={budget} currency={brief.currency ?? 'NGN'} />
                          </span>
                        ) : (
                          <span className="text-muted text-sm">{t('noBudget')}</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {sentQuotes.length > 0 && (
          <section aria-labelledby="sent-heading" className="flex flex-col gap-3">
            <div>
              <h2 id="sent-heading" className="font-display text-lg font-bold tracking-tight">
                {t('sentSection.title')}
              </h2>
              <p className="text-muted text-sm">{t('sentSection.body')}</p>
            </div>
            <ul className="border-border/70 bg-surface divide-border/60 divide-y overflow-hidden rounded-3xl border shadow-[var(--shadow-1)]">
              {sentQuotes.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/quotes/${row.requestId}`}
                    className="hover:bg-surface-2/60 group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition"
                  >
                    <span className="bg-brand-soft text-brand-strong flex size-10 shrink-0 items-center justify-center rounded-xl">
                      <History aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.eventName}</span>
                      <span className="text-muted block text-xs">
                        {t('sentSection.version', { revision: row.revision })}
                        {row.sentAt &&
                          ` · ${new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(row.sentAt))}`}
                      </span>
                    </span>
                    <StatusPill
                      tone={
                        row.status === 'ACCEPTED'
                          ? 'success'
                          : row.status === 'CHANGES_REQUESTED'
                            ? 'warning'
                            : row.status === 'SENT'
                              ? 'brand'
                              : 'neutral'
                      }
                    >
                      {t.has(`statusLabel.${row.status}`)
                        ? t(`statusLabel.${row.status}` as 'statusLabel.SENT')
                        : row.status}
                    </StatusPill>
                    <span className="font-display w-32 text-right font-bold tabular-nums">
                      <MoneyText value={row.totalMinor} currency={row.currency} />
                    </span>
                    <ArrowRight aria-hidden className="text-muted size-4 transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <PaymentCards payments={payments} />
        <ChangeCards changes={changes} />
        <VisitCards visits={visits} />
        <BookingMoneyList bookings={vendorBookings} />
      </div>
    </AppFrame>
  );
}
