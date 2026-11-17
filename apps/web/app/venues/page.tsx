import { coverUrls, listShortlist, loadEventAccess, searchVenues } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { EmptyState, MoneyText, StatusPill } from '@tiwa/ui';
import { BadgeCheck, Building2, Check, MapPin, Star, Users } from 'lucide-react';

import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BusinessCover, BusinessLogo } from '@/components/marketplace/business-cover.js';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame.js';
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
  // D-X80: a venue's own portfolio photo when its spaces have none — never a stock picture.
  const profiles = await prisma.businessProfile.findMany({
    where: { orgId: { in: hits.map((hit) => hit.orgId) } },
    select: { id: true, orgId: true },
  });
  const covers = await coverUrls(profiles.map((row) => ({ orgId: row.orgId, profileId: row.id })));
  const logos = new Set(
    (
      await prisma.organization.findMany({
        where: { id: { in: hits.map((hit) => hit.orgId) }, logoKey: { not: null } },
        select: { id: true },
      })
    ).map((row) => row.id),
  );

  return (
    <MarketplaceFrame active={'venues'} title={t('searchVenuesTitle')}>
      <div className="flex flex-col gap-4 py-4">
        {eventName && (
          <p className="text-muted text-sm">
            {t('shortlistFor', { event: eventName })} ·{' '}
            <Link
              className="text-brand-strong font-medium underline-offset-4 hover:underline"
              href={`/vendors/compare?eventId=${eventId}`}
            >
              {t('compare')}
            </Link>
          </p>
        )}
        <VenueFilters base="/venues" initial={filters} />
        {hits.length === 0 ? (
          <EmptyState icon={<Building2 className="size-6" />} title={t('noVenues')} body={t('noVenuesBody')} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hits.map((hit) => {
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
              const amenitySet = [...new Set(hit.spaces.flatMap((space) => space.amenities))];
              const allAmenities = amenitySet.length;
              const amenities = amenitySet.slice(0, 3);
              const href = `/vendors/${hit.slug}${eventId ? `?eventId=${eventId}` : ''}`;
              return (
                <li
                  key={hit.orgId}
                  className="group border-border/70 bg-surface relative flex flex-col overflow-hidden rounded-3xl border shadow-[var(--shadow-1)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]"
                >
                  {/* D-X86: name, city and verified sit on the photo; the body stays short. */}
                  <div className="bg-surface-2 relative aspect-[16/10] overflow-hidden">
                    <BusinessCover
                      src={
                        own
                          ? `/api/space-photo/${hit.orgId}/${own.space}/${own.photoId}`
                          : (covers.get(hit.orgId) ?? null)
                      }
                      name={hit.name}
                      emptyLabel={t('noPhotosYet')}
                      className="transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                    <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[#1c1917] backdrop-blur-sm">
                      {t('spaceFor', { count: hit.spaces.length })}
                    </span>
                    <div className="absolute top-2 right-2 z-10">
                      <ShortlistButton eventId={eventId} orgId={hit.orgId} initial={shortlisted.has(hit.orgId)} />
                    </div>
                    <div className="absolute inset-x-3 bottom-3 flex items-end gap-2.5">
                      <BusinessLogo
                        src={logos.has(hit.orgId) ? `/api/org-logo/${hit.orgId}` : null}
                        name={hit.name}
                        className="size-9 rounded-xl"
                      />
                      <div className="min-w-0 flex-1 text-white">
                        <p className="flex items-center gap-1">
                          <Link
                            href={href}
                            className="font-display truncate text-base leading-tight font-bold tracking-tight after:absolute after:inset-0"
                          >
                            {hit.name}
                          </Link>
                          {hit.verified && (
                            <BadgeCheck className="size-4 shrink-0 text-white" aria-label={t('verified')} />
                          )}
                        </p>
                        <p className="flex items-center gap-1 truncate text-xs text-white/80">
                          <MapPin className="size-3 shrink-0" aria-hidden />
                          {hit.city}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5 p-3.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                      {capacity > 0 && (
                        <span className="bg-teal-soft text-teal-strong inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold">
                          <Users className="size-3" aria-hidden />
                          {t('upToGuests', { count: capacity })}
                        </span>
                      )}
                      {hit.spaces.slice(0, 2).map((space) => (
                        <span
                          key={space.id}
                          className="bg-surface-2 text-text max-w-[9rem] truncate rounded-full px-2 py-0.5"
                        >
                          {space.name}
                        </span>
                      ))}
                      {hit.spaces.length > 2 && <span className="text-muted">+{hit.spaces.length - 2}</span>}
                    </div>
                    {amenities.length > 0 && (
                      <ul className="text-muted flex flex-wrap gap-x-2.5 gap-y-1 text-[11px]">
                        {amenities.map((key) => (
                          <li key={key} className="inline-flex items-center gap-1">
                            <Check className="text-success size-3" aria-hidden />
                            {t(`amenity_${key}`)}
                          </li>
                        ))}
                        {allAmenities > amenities.length && <li>+{allAmenities - amenities.length}</li>}
                      </ul>
                    )}
                    <div className="border-border/60 mt-auto flex items-center justify-between gap-2 border-t pt-2.5">
                      {from ? (
                        <span className="leading-tight">
                          <span className="text-muted block text-[10px] font-semibold tracking-[0.12em] uppercase">
                            {t('from')}
                          </span>
                          <span className="font-display text-base font-bold tabular-nums">
                            <MoneyText value={from} currency={hit.currency} />
                          </span>
                        </span>
                      ) : (
                        <span />
                      )}
                      {hit.ratingCount >= 5 && hit.ratingAvg !== null ? (
                        <span className="bg-surface-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs">
                          <Star className="fill-accent text-accent size-3.5" aria-hidden />
                          <span className="font-semibold">{hit.ratingAvg.toFixed(1)}</span>
                          <span className="text-muted">({hit.ratingCount})</span>
                        </span>
                      ) : (
                        <StatusPill tone="neutral">{t('newOnTiwa')}</StatusPill>
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
