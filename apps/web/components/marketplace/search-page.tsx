import { listShortlist, loadEventAccess, searchMarketplace } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Badge, Card, Chip, ChipGroup, MoneyText, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
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
    <AppFrame userId={ctx.actor.userId} active="more" title={t(titleKey)}>
      <div className="flex flex-col gap-4 py-4">
        {eventName && (
          <p className="text-muted text-sm">
            {t('shortlistFor', { event: eventName })} ·{' '}
            <Link className="underline" href={`${base}/compare?eventId=${eventId}`}>
              {t('compare')}
            </Link>
          </p>
        )}
        <SearchFilters base={base} initial={filters} />
        {result.hits.length === 0 ? (
          <p className="text-muted text-sm">{t('noResults')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {result.hits.map((hit) => (
              <li key={hit.orgId}>
                <Card>
                  <div className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`${base}/${hit.slug}`}
                          className="font-medium underline decoration-transparent hover:decoration-inherit"
                        >
                          {hit.name}
                        </Link>
                        <p className="text-muted text-sm">{hit.city}</p>
                      </div>
                      {hit.verified && <Badge tone="brand">{t('verified')}</Badge>}
                    </div>
                    <ChipGroup label={hit.name}>
                      {hit.categoryLabels.map((label) => (
                        <Chip key={label}>{label}</Chip>
                      ))}
                    </ChipGroup>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {hit.startingPriceMinor && <MoneyText value={hit.startingPriceMinor} currency={hit.currency} />}
                      {hit.ratingAvg !== null && hit.ratingCount >= 5 ? (
                        <span>
                          ★ {hit.ratingAvg.toFixed(1)} · {t('reviewsCount', { count: hit.ratingCount })}
                        </span>
                      ) : (
                        <StatusPill tone="neutral">{t('newOnTiwa')}</StatusPill>
                      )}
                      {!hit.availabilityFresh && <StatusPill tone="warning">{t('calendarUnconfirmed')}</StatusPill>}
                    </div>
                    <div className="flex gap-2">
                      <ShortlistButton eventId={eventId} orgId={hit.orgId} initial={shortlisted.has(hit.orgId)} />
                      <Link href={`${base}/${hit.slug}`} className="text-sm underline">
                        {t('viewProfile')}
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {result.nextCursor && (
          <Link href={`${base}?${moreParams.toString()}`} className="text-center text-sm underline">
            {t('showMore')}
          </Link>
        )}
      </div>
    </AppFrame>
  );
}
