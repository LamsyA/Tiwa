import * as React from 'react';
import { MessageBusiness } from '@/components/chat/message-business.js';
import type { PublicProfile } from '@tiwa/core';
import { Avatar, Badge, Card, Chip, ChipGroup, MoneyText, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Image, { type StaticImageData } from 'next/image';
import { AvailabilityCalendar } from './availability-calendar.js';
import { coverFor, venueGallery } from './marketplace-frame.js';
import { ReviewReportButton } from './review-report.js';

/** Public vendor/planner profile body (MKT-07, P6-T04): no chrome, no contacts, no prices beyond package starts. */

export interface AvailabilityRow {
  date: string;
  spaceId: string | null;
  slot: string;
}

export async function PublicProfileView({
  profile,
  photos,
  availabilityRows,
  instantBook,
  siteVisit,
  requestQuote,
  reviews,
  signedIn,
  eventDate,
  eventName,
}: {
  profile: PublicProfile;
  photos: { id: string; url: string; caption: string | null }[];
  availabilityRows: AvailabilityRow[];
  instantBook?: React.ReactNode;
  siteVisit?: React.ReactNode;
  /** "Request a quote" (D-X39); the page decides who may send one. */
  requestQuote?: React.ReactNode;
  reviews: {
    id: string;
    overall: number;
    body: string | null;
    authorName: string | null;
    eventName: string | null;
    reply: string | null;
    createdAt: string;
  }[];
  signedIn: boolean;
  /** The viewer's event date (YYYY-MM-DD) when they came from an event (D-X43). */
  eventDate?: string | null;
  eventName?: string | null;
}) {
  const t = await getTranslations('marketplace');
  const showScore = profile.profile.ratingCount >= 5 && profile.profile.ratingAvg !== null;
  const bySpace = new Map<string, AvailabilityRow[]>();
  for (const row of availabilityRows.filter((item) => item.spaceId !== null)) {
    const list = bySpace.get(row.spaceId!) ?? [];
    list.push(row);
    bySpace.set(row.spaceId!, list);
  }

  // Photo mosaic (D-X43): the business's own photos first; venues without any
  // show stock venue pictures (with a note) so the page never looks empty.
  const isVenue = profile.spaces.length > 0 || profile.profile.categories.includes('venue');
  const own: string[] = [
    ...profile.spaces.flatMap((space) =>
      space.photoKeys.map((key) => `/api/space-photo/${profile.org.id}/${space.id}/${key.split('/').pop()}`),
    ),
    ...photos.map((photo) => photo.url),
  ].slice(0, 5);
  const stock: StaticImageData[] =
    own.length > 0
      ? []
      : isVenue
        ? venueGallery(profile.org.id)
        : [coverFor(profile.profile.categories, profile.org.id)];
  const tiles: ({ kind: 'url'; src: string } | { kind: 'static'; src: StaticImageData })[] = own.length
    ? own.map((src) => ({ kind: 'url' as const, src }))
    : stock.map((src) => ({ kind: 'static' as const, src }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {tiles.length > 0 && (
          <section aria-label={t('portfolio')} className="flex flex-col gap-2">
            <div
              className={
                tiles.length >= 3
                  ? 'grid h-64 grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-3xl sm:h-80'
                  : 'h-56 overflow-hidden rounded-3xl sm:h-72'
              }
            >
              {tiles.map((tile, i) => (
                <div
                  key={i}
                  className={
                    tiles.length >= 3
                      ? i === 0
                        ? 'bg-surface-2 relative col-span-4 row-span-2 overflow-hidden sm:col-span-2'
                        : 'bg-surface-2 relative hidden overflow-hidden sm:block ' + (i > 4 ? 'sm:hidden' : '')
                      : i === 0
                        ? 'bg-surface-2 relative size-full overflow-hidden'
                        : 'hidden'
                  }
                >
                  {tile.kind === 'url' ? (
                    <img
                      src={tile.src}
                      alt=""
                      className="size-full object-cover"
                      loading={i === 0 ? 'eager' : 'lazy'}
                    />
                  ) : (
                    <Image
                      src={tile.src}
                      alt=""
                      placeholder="blur"
                      sizes={i === 0 ? '(min-width: 1024px) 480px, 100vw' : '240px'}
                      className="size-full object-cover"
                      priority={i === 0}
                    />
                  )}
                </div>
              ))}
            </div>
            {own.length === 0 && isVenue && <p className="text-muted text-xs">{t('venueStockNote')}</p>}
          </section>
        )}
        <section aria-label={profile.org.name}>
          <div className="flex items-start gap-4">
            <Avatar name={profile.org.name} />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold">{profile.org.name}</h1>
              <p className="text-brand-strong text-sm font-medium">@{profile.org.slug}</p>
              <p className="text-muted text-sm">
                {t('serviceArea', { city: profile.profile.city, km: profile.profile.serviceAreaKm })}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {profile.verified && <Badge tone="brand">{t('verified')}</Badge>}
                {showScore ? (
                  <span
                    className="text-sm font-medium"
                    aria-label={t('reviewsCount', { count: profile.profile.ratingCount })}
                  >
                    ★ {profile.profile.ratingAvg!.toFixed(1)} ·{' '}
                    {t('reviewsCount', { count: profile.profile.ratingCount })}
                  </span>
                ) : (
                  <StatusPill tone="neutral">
                    {t('newOnTiwa')} · {t('bookingsDone', { count: profile.profile.completedBookings })}
                  </StatusPill>
                )}
              </div>
            </div>
          </div>
          <ChipGroup label={profile.org.name}>
            {profile.profile.categoryLabels.map((label) => (
              <Chip key={label}>{label}</Chip>
            ))}
          </ChipGroup>
        </section>

        {profile.profile.bio && (
          <Card>
            <div className="flex flex-col gap-1 p-4">
              <h2 className="font-medium">{t('about')}</h2>
              <p className="text-base whitespace-pre-line">{profile.profile.bio}</p>
            </div>
          </Card>
        )}

        {photos.length > 0 && (
          <section aria-label={t('portfolio')}>
            <h2 className="mb-2 font-medium">{t('portfolio')}</h2>
            <ul className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <li key={photo.id} className="aspect-square overflow-hidden rounded-lg">
                  <img src={photo.url} alt={photo.caption ?? ''} className="size-full object-cover" loading="lazy" />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label={t('reviewsHeading')}>
          <h2 className="mb-2 font-medium">{t('reviewsHeading')}</h2>
          {reviews.length === 0 ? (
            <p className="text-muted text-sm">{t('noReviews')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {reviews.map((row) => (
                <li key={row.id}>
                  <Card>
                    <div className="flex flex-col gap-1 p-4 text-sm">
                      <p className="font-medium">
                        ★ {row.overall.toFixed(1)}
                        {row.authorName ? ` · ${row.authorName}` : ''}
                        {row.eventName ? ` · ${row.eventName}` : ''}
                      </p>
                      {row.body && <p>{row.body}</p>}
                      {row.reply && (
                        <p className="text-muted">
                          {t('reviewReplyHeading')}: {row.reply}
                        </p>
                      )}
                      {signedIn && <ReviewReportButton reviewId={row.id} />}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t('packages')}>
          <h2 className="mb-2 font-medium">{t('packages')}</h2>
          {profile.packages.length === 0 ? (
            <p className="text-muted text-sm">{t('noPackages')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {profile.packages.map((pkg) => (
                <li key={pkg.id}>
                  <Card>
                    <div className="flex flex-col gap-1 p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-medium">{pkg.name}</h3>
                        {pkg.priceMinor && <MoneyText value={pkg.priceMinor} currency={pkg.currency} />}
                      </div>
                      {pkg.description && <p className="text-muted text-sm">{pkg.description}</p>}
                      {pkg.includes.length > 0 && (
                        <div className="mt-1">
                          <h4 className="text-sm font-medium">{t('includesHeading')}</h4>
                          <ul className="text-muted list-disc pl-5 text-sm">
                            {pkg.includes.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t('availability')}>
          <h2 className="mb-2 font-medium">{t('availability')}</h2>
          <Card>
            <div className="p-4 sm:p-5">
              <AvailabilityCalendar
                rows={availabilityRows}
                spaces={profile.spaces.length}
                eventDate={eventDate ?? null}
                eventName={eventName ?? null}
                confirmedAt={profile.profile.availabilityConfirmedAt?.toISOString().slice(0, 10) ?? null}
              />
            </div>
          </Card>
        </section>

        {profile.spaces.length > 0 && (
          <section aria-label={t('venueSectionTitle')}>
            <h2 className="mb-2 font-medium">{t('venueSectionTitle')}</h2>
            <ul className="flex flex-col gap-3">
              {profile.spaces.map((space) => {
                const spaceRows = bySpace.get(space.id) ?? [];
                const coverKey = space.photoKeys[0] ?? null;
                const coverId = coverKey?.split('/').pop() ?? null;
                const fallback = venueGallery(space.id)[0]!;
                return (
                  <li key={space.id}>
                    <Card>
                      <div className="flex flex-col gap-2 p-4">
                        <div className="flex items-start gap-3">
                          <div className="bg-surface-2 relative size-24 shrink-0 overflow-hidden rounded-2xl sm:size-28">
                            {coverId ? (
                              <img
                                src={`/api/space-photo/${profile.org.id}/${space.id}/${coverId}`}
                                alt=""
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <Image
                                src={fallback}
                                alt=""
                                placeholder="blur"
                                sizes="112px"
                                className="size-full object-cover"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium">{space.name}</h3>
                            <p className="text-muted text-sm">
                              {[
                                space.capacitySeated !== null ? `🪑 ${space.capacitySeated}` : null,
                                space.capacityTheatre !== null ? `🎭 ${space.capacityTheatre}` : null,
                                space.capacityStanding !== null ? `🧍 ${space.capacityStanding}` : null,
                                space.sizeSqm !== null ? `${space.sizeSqm} m²` : null,
                                space.indoor ? t('indoorLabel') : t('outdoorLabel'),
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                        </div>
                        {space.amenities.length > 0 && (
                          <p className="text-muted text-sm">
                            {space.amenities.map((key) => t(`amenity_${key}`)).join(' · ')}
                          </p>
                        )}
                        {space.rules && <p className="text-muted text-sm">{space.rules}</p>}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          {(['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY'] as const).map(
                            (slot) =>
                              (space.slotPrices as Record<string, string>)[slot] && (
                                <span key={slot}>
                                  {slot}{' '}
                                  <MoneyText
                                    value={(space.slotPrices as Record<string, string>)[slot] as string}
                                    currency={profile.profile.currency}
                                  />
                                </span>
                              ),
                          )}
                          {space.securityDepositMinor && (
                            <span>
                              {t('depositLabel')}{' '}
                              <MoneyText value={space.securityDepositMinor} currency={profile.profile.currency} />
                            </span>
                          )}
                        </div>
                        {spaceRows.length > 0 && (
                          <p className="text-muted text-sm">
                            {t('venueSpaceAvailability')}:{' '}
                            {spaceRows.map((row) => `${row.date.slice(5)} ${row.slot}`).join(', ')}
                          </p>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <aside className="md:w-80 md:shrink-0">
        <div className="md:sticky md:top-4">
          <Card>
            <div className="flex flex-col gap-2 p-4">
              {profile.profile.startingPriceMinor && (
                <p className="font-medium">
                  <span className="text-muted text-sm font-normal">{t('startingFromLabel')} </span>
                  <MoneyText value={profile.profile.startingPriceMinor} currency={profile.profile.currency} />
                </p>
              )}
              {requestQuote}
              {instantBook}
              <React.Suspense fallback={null}>
                <MessageBusiness orgId={profile.org.id} orgName={profile.org.name} />
              </React.Suspense>
              {siteVisit}
            </div>
          </Card>
        </div>
      </aside>
    </div>
  );
}
