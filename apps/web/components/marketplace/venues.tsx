'use client';

import { DAY_SLOTS, VENUE_AMENITY_KEYS } from '@tiwa/config';
import { Button, MoneyInput } from '@tiwa/ui';
import { Check, Home, MapPin, Search, SlidersHorizontal, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface VenueFilterValues {
  city: string;
  date: string;
  slot: string;
  guests: string;
  indoor: boolean;
  amenities: string[];
  maxPrice: string;
  eventId: string;
}

/** P6-T09 → D-X86: venue search as one sleek bar, with amenities as one-tap chips. */
export function VenueFilters({ base, initial }: { base: '/venues'; initial: VenueFilterValues }) {
  const t = useTranslations('marketplace');
  const router = useRouter();
  const uid = React.useId();
  const [values, setValues] = React.useState(initial);
  const [more, setMore] = React.useState(Boolean(initial.maxPrice));

  function push(next: VenueFilterValues) {
    const params = new URLSearchParams();
    if (next.city) params.set('city', next.city);
    if (next.date) params.set('date', next.date);
    if (next.slot) params.set('slot', next.slot);
    if (next.guests) params.set('guests', next.guests);
    if (next.indoor) params.set('indoor', '1');
    if (next.amenities.length > 0) params.set('amenities', next.amenities.join(','));
    if (next.maxPrice) params.set('maxPrice', next.maxPrice);
    if (next.eventId) params.set('eventId', next.eventId);
    router.push(`${base}?${params.toString()}`);
  }
  const apply = () => push(values);
  /** Chips apply at once, like a filter bar should. */
  const toggle = (patch: (current: VenueFilterValues) => VenueFilterValues) =>
    setValues((current) => {
      const next = patch(current);
      push(next);
      return next;
    });

  const cell =
    'bg-surface-2/60 focus-within:bg-surface focus-within:ring-brand/25 flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-2 transition focus-within:ring-2';
  const label = 'text-muted text-[10px] font-semibold tracking-[0.12em] uppercase';
  const field = 'placeholder:text-muted/70 h-7 w-full min-w-0 bg-transparent text-sm font-semibold outline-none';
  const activeCount = values.amenities.length + (values.indoor ? 1 : 0) + (values.maxPrice ? 1 : 0);

  return (
    <section className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-2.5 shadow-[var(--shadow-1)] sm:p-3">
      <form
        className="grid grid-cols-2 gap-2 lg:grid-cols-[1.2fr_0.8fr_1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <label htmlFor={`${uid}-city`} className={cell}>
          <span className={label}>{t('cityLabel')}</span>
          <span className="flex items-center gap-1.5">
            <MapPin aria-hidden className="text-muted size-3.5 shrink-0" />
            <input
              id={`${uid}-city`}
              className={field}
              placeholder={t('cityPlaceholder')}
              value={values.city}
              onChange={(event) => setValues((current) => ({ ...current, city: event.target.value }))}
            />
          </span>
        </label>
        <label htmlFor={`${uid}-guests`} className={cell}>
          <span className={label}>{t('guestsLabel')}</span>
          <span className="flex items-center gap-1.5">
            <Users aria-hidden className="text-muted size-3.5 shrink-0" />
            <input
              id={`${uid}-guests`}
              className={field}
              type="number"
              inputMode="numeric"
              min={1}
              placeholder={t('guestsPlaceholder')}
              value={values.guests}
              onChange={(event) => setValues((current) => ({ ...current, guests: event.target.value }))}
            />
          </span>
        </label>
        <label htmlFor={`${uid}-date`} className={cell}>
          <span className={label}>{t('dateLabel')}</span>
          <input
            id={`${uid}-date`}
            className={field}
            type="date"
            value={values.date}
            onChange={(event) => setValues((current) => ({ ...current, date: event.target.value }))}
          />
        </label>
        <label htmlFor={`${uid}-slot`} className={cell}>
          <span className={label}>{t('slotLabel')}</span>
          <select
            id={`${uid}-slot`}
            className={`${field} cursor-pointer appearance-none`}
            value={values.slot}
            onChange={(event) => setValues((current) => ({ ...current, slot: event.target.value }))}
          >
            <option value="">{t('allSlots')}</option>
            {DAY_SLOTS.map((value) => (
              <option key={value} value={value}>
                {t(`slotName.${value}` as 'allSlots')}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" className="col-span-2 h-full min-h-12 rounded-2xl px-6 lg:col-span-1">
          <Search aria-hidden className="size-4" />
          {t('apply')}
        </Button>
      </form>

      <div className="flex items-center gap-2">
        <div className="scrollbar-none -mx-0.5 flex flex-1 gap-1.5 overflow-x-auto px-0.5 pb-0.5">
          <Chip on={values.indoor} onClick={() => toggle((current) => ({ ...current, indoor: !current.indoor }))}>
            <Home aria-hidden className="size-3.5" />
            {t('indoorLabel')}
          </Chip>
          {VENUE_AMENITY_KEYS.map((key) => (
            <Chip
              key={key}
              on={values.amenities.includes(key)}
              onClick={() =>
                toggle((current) => ({
                  ...current,
                  amenities: current.amenities.includes(key)
                    ? current.amenities.filter((item) => item !== key)
                    : [...current.amenities, key],
                }))
              }
            >
              {t(`amenity_${key}`)}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setMore((open) => !open)}
          aria-expanded={more}
          className="border-border/70 hover:bg-surface-2 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition"
        >
          <SlidersHorizontal aria-hidden className="size-3.5" />
          {t('moreFilters')}
          {activeCount > 0 && (
            <span className="bg-brand-strong text-on-brand grid size-4 place-items-center rounded-full text-[10px]">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {more && (
        <div className="border-border/60 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end">
          <div className="sm:w-64">
            <span className={`${label} mb-1 block px-1`}>{t('maxPriceLabel')}</span>
            <MoneyInput
              id={`${uid}-price`}
              aria-label={t('maxPriceLabel')}
              value={values.maxPrice}
              onValueChange={(maxPrice) => setValues((current) => ({ ...current, maxPrice }))}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={apply}>
              {t('apply')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.push(values.eventId ? `${base}?eventId=${values.eventId}` : base)}
            >
              {t('reset')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition ${
        on
          ? 'border-brand-strong bg-brand-strong text-on-brand'
          : 'border-border/70 bg-surface text-text hover:border-brand/40'
      }`}
    >
      {on && <Check aria-hidden className="size-3.5" />}
      {children}
    </button>
  );
}
