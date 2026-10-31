import { listShortlist, loadEventAccess, searchVenues } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Badge, Card, Chip, ChipGroup, MoneyText, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ShortlistButton } from '@/components/marketplace/search.js';
import { VenueFilters, type VenueFilterValues } from '@/components/marketplace/venues.js';

/** Venue search (MKT-03 venues, P6-T09): date + slot, capacity, area, price, indoor, amenities. */
export default async function VenuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : undefined);
  const sp = await searchParams;
  const ctx = await requirePageUser('/venues');
  const t = await getTranslations('marketplace');
  const eventId = first(sp.eventId) ?? null;

  let eventName: string | null = null;
  let shortlisted = new Set<string>();
  if (eventId) {
    const access = await loadEventAccess(ctx.actor.userId, eventId);
    if (!access) notFound();
    eventName = (await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } })).name;
    shortlisted = new Set((await listShortlist(ctx.actor, { eventId })).map((row) => row.orgId));
  }

  const filters: VenueFilterValues = {
    city: first(sp.city) ?? '',
    date: first(sp.date) ?? '',
    slot: first(sp.slot) ?? '',
    guests: first(sp.guests) ?? '',
    indoor: first(sp.indoor) === '1',
    amenities: (first(sp.amenities) ?? '').split(',').filter(Boolean),
    maxPrice: first(sp.maxPrice) ?? '',
    eventId: eventId ?? '',
  };
  const { hits } = await searchVenues(ctx.actor, {
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.date ? { date: filters.date } : {}),
    ...(filters.slot ? { slot: filters.slot as 'MORNING' } : {}),
    ...(filters.guests ? { guests: Number(filters.guests) } : {}),
    ...(filters.indoor ? { indoor: true } : {}),
    amenities: filters.amenities,
    ...(filters.maxPrice ? { maxPriceMinor: filters.maxPrice } : {}),
  });

  return (
    <AppFrame userId={ctx.actor.userId} active="more" title={t('searchVenuesTitle')}>
      <div className="flex flex-col gap-4 py-4">
        {eventName && (
          <p className="text-muted text-sm">
            {t('shortlistFor', { event: eventName })} ·{' '}
            <Link className="underline" href={`/vendors/compare?eventId=${eventId}`}>
              {t('compare')}
            </Link>
          </p>
        )}
        <VenueFilters base="/venues" initial={filters} />
        {hits.length === 0 ? (
          <p className="text-muted text-sm">{t('noVenues')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {hits.map((hit) => (
              <li key={hit.orgId}>
                <Card>
                  <div className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/vendors/${hit.slug}`}
                          className="font-medium underline decoration-transparent hover:decoration-inherit"
                        >
                          {hit.name}
                        </Link>
                        <p className="text-muted text-sm">{hit.city}</p>
                      </div>
                      {hit.verified && <Badge tone="brand">{t('verified')}</Badge>}
                    </div>
                    {hit.ratingCount >= 5 && hit.ratingAvg !== null ? (
                      <span className="text-sm">
                        ★ {hit.ratingAvg.toFixed(1)} · {t('reviewsCount', { count: hit.ratingCount })}
                      </span>
                    ) : (
                      <StatusPill tone="neutral">
                        {t('newOnTiwa')} · {t('bookingsDone', { count: hit.completedBookings })}
                      </StatusPill>
                    )}
                    <ul className="flex flex-col gap-1 text-sm">
                      {hit.spaces.map((space) => (
                        <li
                          key={space.id}
                          className="border-border flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-2 py-1"
                        >
                          <span className="font-medium">{space.name}</span>
                          <ChipGroup label={space.name}>
                            {[
                              space.capacitySeated !== null ? `🪑 ${space.capacitySeated}` : null,
                              space.sizeSqm !== null ? `${space.sizeSqm} m²` : null,
                            ]
                              .filter(Boolean)
                              .map((label) => (
                                <Chip key={label as string}>{label}</Chip>
                              ))}
                          </ChipGroup>
                          {space.slotPriceMinor && filters.slot && (
                            <MoneyText value={space.slotPriceMinor} currency={hit.currency} />
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="text-muted text-sm">{t('spaceFor', { count: hit.spaces.length })}</p>
                    <div className="flex gap-2">
                      <ShortlistButton eventId={eventId} orgId={hit.orgId} initial={shortlisted.has(hit.orgId)} />
                      <Link href={`/vendors/${hit.slug}`} className="text-sm underline">
                        {t('viewProfile')}
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}
