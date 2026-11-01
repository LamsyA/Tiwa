'use client';

import { VENDOR_CATEGORIES } from '@tiwa/config';
import { Button, FieldShell, Input, MoneyInput, Select, Switch, cn } from '@tiwa/ui';
import { ChevronDown, Heart, LayoutGrid, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toggleShortlistAction } from './actions.js';

/** Shared marketplace search UI (P6-T05/T06): filters, result cards with shortlist hearts, cursor paging. */

export interface SearchFilterValues {
  q: string;
  category: string;
  city: string;
  minPrice: string;
  maxPrice: string;
  minRating: string;
  verified: boolean;
  freeOn: string;
  sort: string;
  eventId: string;
}

export function SearchFilters({ base, initial }: { base: '/vendors' | '/planners'; initial: SearchFilterValues }) {
  const t = useTranslations('marketplace');
  const router = useRouter();
  const uid = React.useId();
  const [values, setValues] = React.useState(initial);
  const advancedCount =
    [values.minPrice, values.maxPrice, values.minRating, values.freeOn].filter(Boolean).length +
    (values.verified ? 1 : 0);
  const [open, setOpen] = React.useState(advancedCount > 0);

  function set<Key extends keyof SearchFilterValues>(key: Key, value: SearchFilterValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function apply(next: SearchFilterValues = values) {
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.category) params.set('category', next.category);
    if (next.city) params.set('city', next.city);
    if (next.minPrice) params.set('minPrice', next.minPrice);
    if (next.maxPrice) params.set('maxPrice', next.maxPrice);
    if (next.minRating) params.set('minRating', next.minRating);
    if (next.verified) params.set('verified', '1');
    if (next.freeOn) params.set('freeOn', next.freeOn);
    if (next.sort !== 'rating') params.set('sort', next.sort);
    if (next.eventId) params.set('eventId', next.eventId);
    router.push(`${base}?${params.toString()}`);
  }

  const field = 'h-12 w-full bg-transparent pl-10 pr-3 text-[15px] text-text placeholder:text-muted outline-none';

  return (
    <form
      role="search"
      aria-label={t('searchLabel')}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      className="flex flex-col gap-3"
    >
      <div className="border-border/80 bg-bg focus-within:border-brand-strong focus-within:ring-brand-strong/15 flex flex-col overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-16px_rgb(0_0_0/0.15)] transition-[box-shadow,border-color] focus-within:ring-4 md:flex-row md:items-center md:rounded-full md:p-1.5">
        <label className="relative flex-[1.4]">
          <span className="sr-only">{t('qLabel')}</span>
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            id={`${uid}-q`}
            className={field}
            placeholder={t('qPlaceholder')}
            value={values.q}
            onChange={(event) => set('q', event.target.value)}
          />
        </label>
        <span className="bg-border/80 hidden h-7 w-px md:block" aria-hidden />
        <label className="border-border/70 relative flex-1 border-t md:border-t-0">
          <span className="sr-only">{t('cityLabel')}</span>
          <MapPin
            className="text-muted pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            id={`${uid}-city`}
            className={field}
            placeholder={t('cityPlaceholder')}
            value={values.city}
            onChange={(event) => set('city', event.target.value)}
          />
        </label>
        {base === '/vendors' && (
          <>
            <span className="bg-border/80 hidden h-7 w-px md:block" aria-hidden />
            <label className="border-border/70 relative flex-1 border-t md:border-t-0">
              <span className="sr-only">{t('categoryLabel')}</span>
              <LayoutGrid
                className="text-muted pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
                aria-hidden
              />
              <select
                id={`${uid}-cat`}
                className={cn(field, 'appearance-none pr-9')}
                value={values.category}
                onChange={(event) => {
                  const next = { ...values, category: event.target.value };
                  setValues(next);
                  apply(next);
                }}
              >
                <option value="">{t('allCategories')}</option>
                {Object.entries(VENDOR_CATEGORIES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="text-muted pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
                aria-hidden
              />
            </label>
          </>
        )}
        <div className="border-border/70 border-t p-2 md:border-t-0 md:p-0">
          <Button
            type="submit"
            fullWidth
            className="rounded-xl md:size-11 md:rounded-full md:p-0"
            aria-label={t('apply')}
          >
            <Search className="size-4" aria-hidden />
            <span className="md:sr-only">{t('apply')}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className={cn(
            'border-border/80 bg-bg hover:border-text/25 inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
            open && 'border-text/30',
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {t('filters')}
          {advancedCount > 0 && (
            <span className="bg-brand-strong text-on-brand grid size-5 place-items-center rounded-full text-[11px]">
              {advancedCount}
            </span>
          )}
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted">{t('sortLabel')}</span>
          <select
            className="border-border/80 bg-bg hover:border-text/25 h-9 rounded-full border px-3 text-sm font-medium outline-none"
            value={values.sort}
            onChange={(event) => {
              const next = { ...values, sort: event.target.value };
              setValues(next);
              apply(next);
            }}
          >
            <option value="rating">{t('sortRating')}</option>
            <option value="priceAsc">{t('sortPriceAsc')}</option>
            <option value="priceDesc">{t('sortPriceDesc')}</option>
            <option value="recent">{t('sortRecent')}</option>
          </select>
        </label>
      </div>

      {open && (
        <div className="border-border/80 bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <FieldShell id={`${uid}-min`} label={t('minPriceLabel')}>
            {(describedBy) => (
              <MoneyInput
                id={`${uid}-min`}
                aria-describedby={describedBy}
                value={values.minPrice}
                onValueChange={(value) => set('minPrice', value)}
              />
            )}
          </FieldShell>
          <FieldShell id={`${uid}-max`} label={t('maxPriceLabel')}>
            {(describedBy) => (
              <MoneyInput
                id={`${uid}-max`}
                aria-describedby={describedBy}
                value={values.maxPrice}
                onValueChange={(value) => set('maxPrice', value)}
              />
            )}
          </FieldShell>
          <FieldShell id={`${uid}-rating`} label={t('ratingLabel')}>
            {(describedBy) => (
              <Select
                id={`${uid}-rating`}
                aria-describedby={describedBy}
                value={values.minRating}
                onValueChange={(value) => set('minRating', value)}
                options={[
                  { value: '', label: t('anyRating') },
                  { value: '3', label: '3+' },
                  { value: '4', label: '4+' },
                  { value: '4.5', label: '4.5+' },
                ]}
              />
            )}
          </FieldShell>
          <FieldShell id={`${uid}-free`} label={t('freeOnLabel')}>
            {(describedBy) => (
              <Input
                id={`${uid}-free`}
                aria-describedby={describedBy}
                type="date"
                value={values.freeOn}
                onChange={(event) => set('freeOn', event.target.value)}
              />
            )}
          </FieldShell>
          <label className="flex h-11 items-center gap-2 text-sm font-medium">
            <Switch checked={values.verified} onCheckedChange={(checked) => set('verified', checked)} />
            {t('verifiedLabel')}
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-5 lg:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push(values.eventId ? `${base}?eventId=${values.eventId}` : base)}
            >
              {t('reset')}
            </Button>
            <Button type="submit">{t('showResults')}</Button>
          </div>
        </div>
      )}
    </form>
  );
}

export function ShortlistButton({
  eventId,
  orgId,
  initial,
}: {
  eventId: string | null;
  orgId: string;
  initial: boolean;
}) {
  const t = useTranslations('marketplace');
  const [saved, setSaved] = React.useState(initial);
  if (!eventId) return null;
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? t('shortlisted') : t('shortlist')}
      onClick={() =>
        void toggleShortlistAction({ eventId, orgId }).then((result) => {
          if (result.ok) setSaved(result.data.shortlisted);
        })
      }
      className={cn(
        'grid size-9 place-items-center rounded-full bg-white/90 text-black shadow-1 backdrop-blur-md transition-transform hover:scale-105 active:scale-95',
        saved && 'text-brand-strong',
      )}
    >
      <Heart className={cn('size-4', saved && 'fill-current')} aria-hidden />
    </button>
  );
}
