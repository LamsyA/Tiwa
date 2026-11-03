import { listShortlist, loadEventAccess, searchVenues } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { EmptyState, MoneyText, StatusPill } from '@tiwa/ui';
import { BadgeCheck, Building2, MapPin, Star, Users } from 'lucide-react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketplaceFrame, venueGallery } from '@/components/marketplace/marketplace-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ShortlistButton } from '@/components/marketplace/search.js';
import { VenueFilters, type VenueFilterValues } from '@/components/marketplace/venues.js';

/** Venue search (MKT-03 venues, P6-T09): date + slot, capacity, area, price, indoor, amenities. */
export default async function VenuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
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
    <MarketplaceFrame active={'venues'} title={t('searchVenuesTitle')}>
      <div className="flex flex-col gap-4 py-4">
        {eventName && (
          <p className="text-muted text-sm">
            {t('shortlistFor', { event: eventName })} ·{' '}
            <Link className="text-brand-strong font-medium underline-offset-4 hover:underline" href={`/vendors/compare?eventId=${eventId}`}>
              {t('compare')}
            </Link>
          </p>
        )}
        <VenueFilters base="/venues" initial={filters} />
        {hits.length === 0 ? (
          <EmptyState icon={<Building2 className="size-6" />} title={t('noVenues')} body={t('noVenuesBody')} />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {hits.map((hit, index) => {
              const own = hit.spaces.flatMap((space) =>
                space.photoIds.map((photoId) => ({ space: space.id, photoId })),
              )[0];
              const capacity = Math.max(
                0,
                ...hit.spaces.map(
                  (space) => space.capacityStanding ?? space.capacityTheatre ?? space.capacitySeated ?? 0,
                ),
              );
              const from = hit.spaces
                .map((space) => (filters.slot ? space.slotPriceMinor : space.fromMinor))
                .filter((value): value is string => value !== null)
                .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))[0];
              const amenities = [...new Set(hit.spaces.flatMap((space) => space.amenities))].slice(0, 3);
              const href = `/vendors/${hit.slug}${eventId ? `?eventId=${eventId}` : ''}`;
              return (
                <li
                  key={hit.orgId}
                  className="group border-border/80 bg-bg relative flex flex-col overflow-hidden rounded-3xl border shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-2"
                >
                  <div className="bg-surface-2 relative aspect-[4/3] overflow-hidden">
                    {own ? (
                      <img
                        src={`/api/space-photo/${hit.orgId}/${own.space}/${own.photoId}`}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <Image
                        src={venueGallery(hit.orgId || index)[0]!}
                        alt=""
                        placeholder="blur"
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
                    <span className="absolute top-3 left-3 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
                      {t('spaceFor', { count: hit.spaces.length })}
                    </span>
                    <div className="absolute top-2 right-2 z-10">
                      <ShortlistButton eventId={eventId} orgId={hit.orgId} initial={shortlisted.has(hit.orgId)} />
                    </div>
                    {capacity > 0 && (
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-black">
                        <Users className="size-3.5" aria-hidden />
                        {t('upToGuests', { count: capacity })}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={href}
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
                    </p>
                    <ul className="flex flex-wrap gap-1.5" aria-label={t('spaceFor', { count: hit.spaces.length })}>
                      {hit.spaces.slice(0, 3).map((space) => (
                        <li
                          key={space.id}
                          className="bg-brand-soft/70 text-brand-strong rounded-full px-2.5 py-0.5 text-xs font-medium"
                        >
                          {space.name}
                        </li>
                      ))}
                    </ul>
                    {amenities.length > 0 && (
                      <p className="text-muted truncate text-xs">
                        {amenities.map((key) => t(`amenity_${key}`)).join(' · ')}
                      </p>
                    )}
                    <div className="border-border/70 mt-auto flex items-end justify-between gap-2 border-t pt-3 text-sm">
                      {hit.ratingCount >= 5 && hit.ratingAvg !== null ? (
                        <span className="flex items-center gap-1">
                          <Star className="fill-accent text-accent size-4" aria-hidden />
                          <span className="font-semibold">{hit.ratingAvg.toFixed(1)}</span>
                          <span className="text-muted">({hit.ratingCount})</span>
                        </span>
                      ) : (
                        <StatusPill tone="neutral">{t('newOnTiwa')}</StatusPill>
                      )}
                      {from && (
                        <span className="flex flex-col items-end">
                          <span className="text-muted text-xs">{t('from')}</span>
                          <span className="font-semibold">
                            <MoneyText value={from} currency={hit.currency} />
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </MarketplaceFrame>
  );
}
