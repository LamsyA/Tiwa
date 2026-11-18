import { PLANNING_CATEGORY } from '@tiwa/config';
import { eventOrders, getEventVendorCategories, listSiteVisits, type OrderStage } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { StatusPill, buttonClasses } from '@tiwa/ui';
import { ArrowRight, CheckCircle2, FileSignature, GitCompare, Search, Sparkles } from 'lucide-react';
import plannerImg from '../../../../public/marketplace/planner-1.jpg';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { coverFor } from '@/components/marketplace/marketplace-frame.js';
import { OrdersBoard } from '@/components/orders/orders-board.js';
import { GuestChangeFlow } from '../guest-change/guest-change.js';

const STAGE_RANK: OrderStage[] = ['closed', 'requested', 'quoted', 'booked', 'confirmed', 'delivered', 'completed'];

/** Event vendors board (P6-T07): template categories with shortlist signal, linking into filtered search. */
export default async function EventVendorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(eventId, '/vendors');
  const t = await getTranslations('marketplace');
  if (!allowed) {
    return (
      <EventFrame
        eventId={eventId}
        userId={ctx.actor.userId}
        access={access}
        active="vendors"
        title={t('eventVendorsTitle')}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
      >
        <Forbidden eventId={eventId} />
      </EventFrame>
    );
  }
  const [categories, orders] = await Promise.all([
    getEventVendorCategories(ctx.actor, { eventId }),
    eventOrders(ctx.actor, { eventId }),
  ]);
  // Furthest stage reached per category and who it is with (D-X79: the row says where it stands).
  const stageByCategory = new Map<string, OrderStage>();
  const leadByCategory = new Map<string, string>();
  const requestsByCategory = new Map<string, number>();
  for (const row of orders.rows) {
    if (row.stage === 'requested') {
      requestsByCategory.set(row.categoryKey, (requestsByCategory.get(row.categoryKey) ?? 0) + 1);
    }
    const current = stageByCategory.get(row.categoryKey);
    if (!current || STAGE_RANK.indexOf(row.stage) > STAGE_RANK.indexOf(current)) {
      stageByCategory.set(row.categoryKey, row.stage);
      if (row.counterparty) leadByCategory.set(row.categoryKey, row.counterparty);
    }
  }
  // D-X89: only the host changes the guest count — they pay and know the number.
  const canChangeCount = access?.role === 'HOST';
  const countEvent = canChangeCount
    ? await prisma.event.findUnique({ where: { id: eventId }, select: { name: true, expectedGuests: true } })
    : null;
  const shortlistTotal = categories.reduce((sum, row) => sum + row.shortlisted, 0);
  const visits = await listSiteVisits(ctx.actor, { eventId }).catch(() => []);
  const visitOrgs =
    visits.length > 0
      ? await prisma.organization.findMany({
          where: { id: { in: [...new Set(visits.map((row) => row.vendorOrgId))] } },
          select: { id: true, name: true },
        })
      : [];
  const visitNames = new Map(visitOrgs.map((org) => [org.id, org.name]));
  // Hire a planner (D-X64): hosts and co-hosts only; a planner on the event doesn't hire themselves.
  const showPlanner = access?.role === 'HOST' || access?.role === 'CO_HOST';
  const [hiredPlanner, planningRequestIds] = showPlanner
    ? await Promise.all([
        prisma.eventParticipant.findFirst({
          where: { eventId, role: 'PLANNER', removedAt: null, orgId: { not: null } },
          select: { orgId: true },
        }),
        prisma.quoteRequest
          .findMany({ where: { eventId, category: PLANNING_CATEGORY }, select: { id: true } })
          .then((rows) => rows.map((row) => row.id)),
      ])
    : [null, [] as string[]];
  const planningRequests = planningRequestIds.length;
  const planningProposals =
    planningRequests > 0
      ? await prisma.quote.count({
          where: { requestId: { in: planningRequestIds }, status: { in: ['SENT', 'CHANGES_REQUESTED'] } },
        })
      : 0;
  const hiredName = hiredPlanner?.orgId
    ? ((await prisma.organization.findUnique({ where: { id: hiredPlanner.orgId }, select: { name: true } }))?.name ??
      null)
    : null;
  // D-X76: the hired planner's own booking, so the host can see the agreement and pay it.
  const plannerBooking = hiredPlanner?.orgId
    ? await prisma.booking.findFirst({
        where: { eventId, vendorOrgId: hiredPlanner.orgId, category: PLANNING_CATEGORY },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    : null;
  return (
    <EventFrame
      eventId={eventId}
      userId={ctx.actor.userId}
      access={access}
      active="vendors"
      title={t('eventVendorsTitle')}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
    >
      <div className="flex flex-col gap-5 py-4">
        <section className="border-border/70 bg-surface flex flex-col gap-4 rounded-3xl border p-5 shadow-[var(--shadow-1)] sm:p-6">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight">{t('findHeading')}</h2>
            <p className="text-muted text-sm">{t('eventVendorsBody')}</p>
          </div>
          <form action="/vendors" className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="eventId" value={eventId} />
            <label className="relative flex-1">
              <span className="sr-only">{t('findPlaceholder')}</span>
              <Search
                aria-hidden
                className="text-muted pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
              />
              <input
                name="q"
                placeholder={t('findPlaceholder')}
                className="border-border bg-bg focus:border-brand h-12 w-full rounded-2xl border pr-4 pl-11 text-base outline-none"
              />
            </label>
            <button type="submit" className={buttonClasses({ size: 'lg', className: 'rounded-2xl' })}>
              {t('findButton')}
            </button>
          </form>
          {shortlistTotal > 0 && (
            <Link
              href={`/vendors/compare?eventId=${eventId}`}
              className="text-brand-strong inline-flex w-fit items-center gap-1.5 text-sm font-semibold hover:underline"
            >
              <GitCompare aria-hidden className="size-4" />
              {t('compareShortlist', { count: shortlistTotal })}
            </Link>
          )}
        </section>

        {showPlanner && (
          <section className="relative overflow-hidden rounded-3xl bg-[#1c1917] text-white shadow-[var(--shadow-2)]">
            <Image
              src={plannerImg}
              alt=""
              placeholder="blur"
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="absolute inset-y-0 right-0 hidden h-full w-1/2 object-cover opacity-80 md:block"
            />
            <div className="absolute inset-0 hidden bg-gradient-to-r from-[#1c1917] via-[#1c1917]/95 to-transparent md:block" />
            <div className="relative flex flex-col gap-4 p-6 sm:p-6 md:max-w-[60%]">
              <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-[#f2b705] uppercase">
                <Sparkles aria-hidden className="size-3.5" />
                {t('hirePlanner.eyebrow')}
              </p>
              {hiredName ? (
                <>
                  <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    {t('hirePlanner.hiredTitle', { planner: hiredName })}
                  </h2>
                  <p className="text-sm text-white/75">{t('hirePlanner.hiredBody')}</p>
                  <p className="flex items-center gap-2 text-sm font-medium text-[#a7f3d0]">
                    <CheckCircle2 aria-hidden className="size-4" />
                    {t('hirePlanner.hiredPill')}
                  </p>
                  {plannerBooking && (
                    <Link
                      href={`/events/${eventId}/bookings/${plannerBooking.id}?tab=payments`}
                      className="inline-flex h-10 w-fit items-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-[#1c1917] transition hover:bg-white/90"
                    >
                      {t('hirePlanner.viewBooking')}
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    {t('hirePlanner.title')}
                  </h2>
                  <p className="text-sm leading-relaxed text-white/75">{t('hirePlanner.body')}</p>
                  {planningRequests > 0 && (
                    <p className="text-sm font-medium text-white">
                      {planningProposals > 0
                        ? t('hirePlanner.proposalsReady', { count: planningProposals })
                        : t('hirePlanner.waiting', { count: planningRequests })}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link
                      href={`/planners?eventId=${eventId}`}
                      className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-[#1c1917] transition hover:bg-white/90"
                    >
                      <Search aria-hidden className="size-4" />
                      {t('hirePlanner.find')}
                    </Link>
                    {planningRequests > 0 && (
                      <Link
                        href={`/events/${eventId}/vendors/${PLANNING_CATEGORY}`}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/25 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
                      >
                        <FileSignature aria-hidden className="size-4" />
                        {t('hirePlanner.viewProposals')}
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        <section aria-labelledby="categories-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="categories-heading" className="font-display text-xl font-bold tracking-tight">
              {t('categoriesHeading')}
            </h2>
            {/* D-X84: a new guest count becomes vendor changes, approved on WhatsApp. */}
            {countEvent && (
              <GuestChangeFlow
                eventId={eventId}
                eventName={countEvent.name}
                currentCount={countEvent.expectedGuests ?? null}
              />
            )}
          </div>
          {/* D-X79: compact status rows (planner workspace style) instead of 15 photo tiles. */}
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...categories]
              .map((row, index) => ({ row, index, stage: stageByCategory.get(row.category) }))
              .sort((a, b) => {
                const rank = (x: typeof a) => (x.stage && x.stage !== 'closed' ? 0 : x.row.shortlisted > 0 ? 1 : 2);
                return rank(a) - rank(b) || a.index - b.index;
              })
              .map(({ row, index, stage }) => {
                const lead = leadByCategory.get(row.category) ?? '';
                const boardHref = `/events/${eventId}/vendors/${encodeURIComponent(row.category)}`;
                const findHref =
                  row.category === 'venue'
                    ? `/venues?eventId=${eventId}`
                    : `/vendors?category=${encodeURIComponent(row.category)}&eventId=${eventId}`;
                const live = stage && stage !== 'closed' ? stage : null;
                const status = live
                  ? live === 'quoted'
                    ? { text: t('vendorRow.quoted', { name: lead }), tone: 'text-teal-strong', dot: 'bg-teal' }
                    : live === 'requested'
                      ? {
                          text: t('vendorRow.requested', { count: requestsByCategory.get(row.category) ?? 1 }),
                          tone: 'text-muted',
                          dot: 'bg-[var(--accent)]',
                        }
                      : live === 'booked'
                        ? { text: t('vendorRow.booked', { name: lead }), tone: 'text-brand-strong', dot: 'bg-brand' }
                        : { text: t('vendorRow.confirmed', { name: lead }), tone: 'text-success', dot: 'bg-success' }
                  : row.shortlisted > 0
                    ? {
                        text: t('vendorRow.shortlisted', { count: row.shortlisted }),
                        tone: 'text-text',
                        dot: 'bg-brand',
                      }
                    : { text: t('vendorRow.notStarted'), tone: 'text-muted', dot: 'bg-border' };
                const action =
                  live === 'quoted'
                    ? { href: boardHref, label: t('vendorRow.review'), primary: true }
                    : live || row.shortlisted > 0
                      ? {
                          href: boardHref,
                          label: live ? t('vendorRow.view') : t('vendorRow.requestQuotes'),
                          primary: !live,
                        }
                      : { href: findHref, label: t('findButton'), primary: false };
                return (
                  <li
                    key={row.category}
                    className={`bg-surface relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-[var(--shadow-1)] transition hover:shadow-[var(--shadow-2)] ${
                      live === 'quoted' ? 'border-teal/40' : 'border-border/70'
                    }`}
                  >
                    <Image
                      src={coverFor([row.category], index)}
                      alt=""
                      placeholder="blur"
                      sizes="44px"
                      className="size-11 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{row.label}</p>
                      <p className={`flex items-center gap-1.5 truncate text-xs font-medium ${status.tone}`}>
                        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${status.dot}`} />
                        <span className="truncate">{status.text}</span>
                      </p>
                    </div>
                    <Link
                      href={action.href}
                      className={`relative z-10 inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold transition ${
                        action.primary
                          ? live === 'quoted'
                            ? 'bg-teal text-white hover:brightness-110'
                            : 'bg-brand-strong text-on-brand hover:brightness-110'
                          : 'bg-surface-2 text-text hover:bg-border/60'
                      }`}
                    >
                      {action.label}
                      <ArrowRight aria-hidden className="size-3.5" />
                    </Link>
                  </li>
                );
              })}
          </ul>
          <Link
            href={`/vendors?eventId=${eventId}`}
            className="text-brand-strong w-fit text-sm font-semibold hover:underline"
          >
            {t('allCategories')}
          </Link>
        </section>

        {orders.rows.length > 0 && <OrdersBoard rows={orders.rows} counts={orders.counts} side="client" />}

        {visits.length > 0 && (
          <>
            <h2 className="pt-2 font-medium">{t('visitsHeading')}</h2>
            <ul className="flex flex-col gap-2">
              {visits.map((visit) => (
                <li key={visit.id} className="border-border/70 rounded-2xl border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium">{visitNames.get(visit.vendorOrgId) ?? ''}</span>
                    <StatusPill tone={visit.status === 'CONFIRMED' ? 'success' : 'neutral'}>{visit.status}</StatusPill>
                  </div>
                  <p className="text-muted">
                    {visit.confirmedAt
                      ? new Date(visit.confirmedAt).toLocaleString()
                      : visit.proposedTimes.map((time) => new Date(time).toLocaleString()).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </EventFrame>
  );
}
