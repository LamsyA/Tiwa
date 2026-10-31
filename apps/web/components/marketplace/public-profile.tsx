import type { PublicProfile } from '@tiwa/core';
import { Avatar, Badge, Card, Chip, ChipGroup, MoneyText, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';

/** Public vendor/planner profile body (MKT-07, P6-T04): no chrome, no contacts, no prices beyond package starts. */

function monthGrid(year: number, month: number, blocked: Set<string>) {
  const first = new Date(Date.UTC(year, month, 1));
  const startDay = (first.getUTCDay() + 6) % 7; // Monday-first
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: ({ day: number; date: string } | null)[] = Array.from({ length: startDay }, () => null);
  for (let day = 1; day <= days; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, date });
  }
  return { cells, blocked };
}

export interface AvailabilityRow {
  date: string;
  spaceId: string | null;
  slot: string;
}

export async function PublicProfileView({
  profile,
  photos,
  availabilityRows,
}: {
  profile: PublicProfile;
  photos: { id: string; url: string; caption: string | null }[];
  availabilityRows: AvailabilityRow[];
}) {
  const t = await getTranslations('marketplace');
  const now = new Date();
  const wholeBlocked = new Set(availabilityRows.filter((row) => row.spaceId === null).map((row) => row.date));
  const { cells } = monthGrid(now.getUTCFullYear(), now.getUTCMonth(), wholeBlocked);
  const showScore = profile.profile.ratingCount >= 5 && profile.profile.ratingAvg !== null;
  const bySpace = new Map<string, AvailabilityRow[]>();
  for (const row of availabilityRows.filter((item) => item.spaceId !== null)) {
    const list = bySpace.get(row.spaceId!) ?? [];
    list.push(row);
    bySpace.set(row.spaceId!, list);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <section aria-label={profile.org.name}>
          <div className="flex items-start gap-4">
            <Avatar name={profile.org.name} />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold">{profile.org.name}</h1>
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
            <div className="p-4">
              <ol className="grid grid-cols-7 gap-1 text-center text-sm" aria-label={t('availability')}>
                {cells.map((cell, index) =>
                  cell === null ? (
                    <li key={`empty-${index}`} />
                  ) : (
                    <li
                      key={cell.date}
                      aria-label={wholeBlocked.has(cell.date) ? `${cell.date} ${t('blocked')}` : cell.date}
                      className={
                        wholeBlocked.has(cell.date)
                          ? 'bg-muted text-muted rounded-md py-1 line-through'
                          : 'rounded-md py-1'
                      }
                    >
                      {cell.day}
                    </li>
                  ),
                )}
              </ol>
              <p className="text-muted mt-2 text-sm">
                {profile.profile.availabilityConfirmedAt
                  ? t('calendarConfirmed', {
                      date: profile.profile.availabilityConfirmedAt.toISOString().slice(0, 10),
                    })
                  : t('calendarUnconfirmed')}
              </p>
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
                return (
                  <li key={space.id}>
                    <Card>
                      <div className="flex flex-col gap-2 p-4">
                        <div className="flex items-start gap-3">
                          {coverId && (
                            <img
                              src={`/api/space-photo/${profile.org.id}/${space.id}/${coverId}`}
                              alt=""
                              className="size-20 shrink-0 rounded-lg object-cover"
                              loading="lazy"
                            />
                          )}
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
              <p className="text-muted text-sm">{t('requestQuoteSoon')}</p>
            </div>
          </Card>
        </div>
      </aside>
    </div>
  );
}
