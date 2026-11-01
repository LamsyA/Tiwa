import { listShortlist, loadEventAccess, searchMarketplace } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { EmptyState, MoneyText, StatusPill, buttonClasses } from '@tiwa/ui';
import { BadgeCheck, MapPin, SearchX, Star } from 'lucide-react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketplaceFrame, coverFor } from './marketplace-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { SearchFilters, ShortlistButton, type SearchFilterValues } from './search.js';

/** Shared server search page for /vendors and /planners (P6-T05/T06). */

const SORTS = ['rating', 'priceAsc', 'priceDesc', 'recent'] as const;

export async function SearchPageBody({
  kind,
  base,
  titleKey,
  searchParams,
}: {
  kind: 'VENDOR' | 'PLANNER';
  base: '/vendors' | '/planners';
  titleKey: 'searchVendors' | 'searchPlanners';
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const sp = await searchParams;
  const ctx = await requirePageUser(base);
  const t = await getTranslations('marketplace');
  const eventId = first(sp.eventId) ?? null;

  let eventName: string | null = null;
  let shortlisted = new Set<string>();
  if (eventId) {
    const access = await loadEventAccess(ctx.actor.userId, eventId);
    if (!access) notFound();
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } });
    eventName = event.name;
    const picks = await listShortlist(ctx.actor, { eventId });
    shortlisted = new Set(picks.map((row) => row.orgId));
  }

  const sort = SORTS.includes(first(sp.sort) as (typeof SORTS)[number])
    ? (first(sp.sort) as (typeof SORTS)[number])
    : 'rating';
  const filters: SearchFilterValues = {
    q: first(sp.q) ?? '',
    category: first(sp.category) ?? '',
    city: first(sp.city) ?? '',
    minPrice: first(sp.minPrice) ?? '',
    maxPrice: first(sp.maxPrice) ?? '',
    minRating: first(sp.minRating) ?? '',
    verified: first(sp.verified) === '1',
    freeOn: first(sp.freeOn) ?? '',
    sort,
    eventId: eventId ?? '',
  };
  const result = await searchMarketplace(ctx.actor, {
    kind,
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.minPrice ? { minPriceMinor: filters.minPrice } : {}),
    ...(filters.maxPrice ? { maxPriceMinor: filters.maxPrice } : {}),
    ...(filters.minRating ? { minRating: Number(filters.minRating) } : {}),
    ...(filters.verified ? { verifiedOnly: true } : {}),
    ...(filters.freeOn ? { freeOn: filters.freeOn } : {}),
    sort,
    take: 20,
    ...(first(sp.cursor) ? { cursor: first(sp.cursor)! } : {}),
  });

  const kept = new URLSearchParams();
  for (const [key, value] of Object.entries({
    q: filters.q,
    category: filters.category,
    city: filters.city,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    minRating: filters.minRating,
    freeOn: filters.freeOn,
    sort: filters.sort,
    eventId: filters.eventId,
  })) {
    if (value) kept.set(key, value);
  }
  if (filters.verified) kept.set('verified', '1');
  const moreParams = new URLSearchParams(kept);
  if (result.nextCursor) moreParams.set('cursor', result.nextCursor);

  return (
    <MarketplaceFrame
      active={kind === 'PLANNER' ? 'planners' : 'vendors'}
      title={t(titleKey)}
      subtitle={t(kind === 'PLANNER' ? 'plannersSubtitle' : 'vendorsSubtitle')}
    >
      {eventName && (
        <div className="border-border/80 bg-surface mb-6 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm">
          <span className="text-muted">{t('shortlistFor', { event: eventName })}</span>
          <Link
            className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'ml-auto rounded-full' })}
            href={`${base}/compare?eventId=${eventId}`}
          >
            {t('compare')}
          </Link>
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <SearchFilters base={base} initial={filters} />
        </aside>
        <div>
          {result.hits.length === 0 ? (
            <EmptyState icon={<SearchX className="size-6" />} title={t('noResults')} body={t('noResultsBody')} />
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {result.hits.map((hit) => (
                <li
                  key={hit.orgId}
                  className="group border-border/80 bg-bg relative flex flex-col overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-2"
                >
                  <div className="bg-surface-2 relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={coverFor(hit.categories, hit.orgId)}
                      alt=""
                      placeholder="blur"
                      sizes="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 100vw"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
                    {hit.categoryLabels[0] && (
                      <span className="absolute top-3 left-3 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
                        {hit.categoryLabels[0]}
                      </span>
                    )}
                    <div className="absolute top-2 right-2 z-10">
                      <ShortlistButton eventId={eventId} orgId={hit.orgId} initial={shortlisted.has(hit.orgId)} />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`${base}/${hit.slug}${eventId ? `?eventId=${eventId}` : ''}`}
                        className="font-display truncate text-lg font-bold tracking-tight after:absolute after:inset-0"
                      >
                        {hit.name}
                      </Link>
                      {hit.verified && (
                        <BadgeCheck className="text-brand-strong size-4 shrink-0" aria-label={t('verified')} />
                      )}
                    </div>
                    <p className="text-muted flex items-center gap-1 text-sm">
                      <MapPin className="size-3.5" aria-hidden />
                      {hit.city}
                      {hit.categoryLabels.length > 1 && <span> · {hit.categoryLabels.slice(1, 3).join(', ')}</span>}
                    </p>
                    <div className="border-border/70 mt-auto flex items-end justify-between gap-2 border-t pt-3 text-sm">
                      {hit.ratingAvg !== null && hit.ratingCount >= 5 ? (
                        <span className="flex items-center gap-1">
                          <Star className="fill-accent text-accent size-4" aria-hidden />
                          <span className="font-semibold">{hit.ratingAvg.toFixed(1)}</span>
                          <span className="text-muted">({hit.ratingCount})</span>
                        </span>
                      ) : (
                        <StatusPill tone="neutral">{t('newOnTiwa')}</StatusPill>
                      )}
                      {hit.startingPriceMinor && (
                        <span className="flex flex-col items-end">
                          <span className="text-muted text-xs">{t('from')}</span>
                          <span className="font-semibold">
                            <MoneyText value={hit.startingPriceMinor} currency={hit.currency} />
                          </span>
                        </span>
                      )}
                    </div>
                    {!hit.availabilityFresh && <p className="text-warning text-xs">{t('calendarUnconfirmed')}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {result.nextCursor && (
            <div className="mt-8 flex justify-center">
              <Link
                href={`${base}?${moreParams.toString()}`}
                className={buttonClasses({ variant: 'secondary', className: 'rounded-full px-6' })}
              >
                {t('showMore')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </MarketplaceFrame>
  );
}
