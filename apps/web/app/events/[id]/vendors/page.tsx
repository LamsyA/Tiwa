import { eventOrders, getEventVendorCategories, listSiteVisits, type OrderStage } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { StatusPill, buttonClasses } from '@tiwa/ui';
import { ArrowRight, GitCompare, Search } from 'lucide-react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { coverFor } from '@/components/marketplace/marketplace-frame.js';
import { OrdersBoard } from '@/components/orders/orders-board.js';

const STAGE_RANK: OrderStage[] = ['closed', 'requested', 'quoted', 'booked', 'confirmed', 'delivered', 'completed'];

/** Event vendors board (P6-T07): template categories with shortlist signal, linking into filtered search. */
export default async function EventVendorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(eventId, '/vendors');
  const t = await getTranslations('marketplace');
  const to = await getTranslations('orders');
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
  // Furthest stage reached per category, for the card badge.
  const stageByCategory = new Map<string, OrderStage>();
  for (const row of orders.rows) {
    const current = stageByCategory.get(row.categoryKey);
    if (!current || STAGE_RANK.indexOf(row.stage) > STAGE_RANK.indexOf(current)) {
      stageByCategory.set(row.categoryKey, row.stage);
    }
  }
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
      <div className="flex flex-col gap-8 py-4">
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

        <section aria-labelledby="categories-heading" className="flex flex-col gap-3">
          <h2 id="categories-heading" className="font-display text-xl font-bold tracking-tight">
            {t('categoriesHeading')}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((row, index) => {
              const stage = stageByCategory.get(row.category);
              const findHref =
                row.category === 'venue'
                  ? `/venues?eventId=${eventId}`
                  : `/vendors?category=${encodeURIComponent(row.category)}&eventId=${eventId}`;
              return (
                <li
                  key={row.category}
                  className="group border-border/70 bg-surface relative overflow-hidden rounded-3xl border transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]"
                >
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <Image
                      src={coverFor([row.category], index)}
                      alt=""
                      placeholder="blur"
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="size-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <p className="font-display absolute bottom-3 left-4 text-lg font-bold text-white">{row.label}</p>
                    {stage && stage !== 'closed' && (
                      <span className="text-text absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold">
                        {to(`stage.${stage}`)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 p-4">
                    {row.shortlisted > 0 ? (
                      <StatusPill tone="brand">{t('shortlistedCount', { count: row.shortlisted })}</StatusPill>
                    ) : (
                      <span className="text-muted text-sm">{t('noneYet')}</span>
                    )}
                    <div className="ml-auto flex items-center gap-3 text-sm font-semibold">
                      {stage && (
                        <Link
                          href={`/events/${eventId}/vendors/${encodeURIComponent(row.category)}`}
                          className="text-muted hover:text-text relative z-10"
                        >
                          {t('viewButton')}
                        </Link>
                      )}
                      <Link
                        href={findHref}
                        className="text-brand-strong inline-flex items-center gap-1 after:absolute after:inset-0"
                      >
                        {t('findButton')}
                        <ArrowRight aria-hidden className="size-4" />
                      </Link>
                    </div>
                  </div>
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
