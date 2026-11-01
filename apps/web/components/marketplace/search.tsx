'use client';

import { VENDOR_CATEGORIES } from '@tiwa/config';
import { Button, Card, Chip, ChipGroup, FieldShell, Input, MoneyInput, Select, Switch } from '@tiwa/ui';
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

  function set<Key extends keyof SearchFilterValues>(key: Key, value: SearchFilterValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function apply() {
    const params = new URLSearchParams();
    if (values.q) params.set('q', values.q);
    if (values.category) params.set('category', values.category);
    if (values.city) params.set('city', values.city);
    if (values.minPrice) params.set('minPrice', values.minPrice);
    if (values.maxPrice) params.set('maxPrice', values.maxPrice);
    if (values.minRating) params.set('minRating', values.minRating);
    if (values.verified) params.set('verified', '1');
    if (values.freeOn) params.set('freeOn', values.freeOn);
    if (values.sort !== 'rating') params.set('sort', values.sort);
    if (values.eventId) params.set('eventId', values.eventId);
    router.push(`${base}?${params.toString()}`);
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <FieldShell id={`${uid}-q`} label={t('qLabel')}>
            {(describedBy) => (
              <Input
                id={`${uid}-q`}
                aria-describedby={describedBy}
                placeholder={t('qPlaceholder')}
                value={values.q}
                onChange={(event) => set('q', event.target.value)}
              />
            )}
          </FieldShell>
          <FieldShell id={`${uid}-city`} label={t('cityLabel')}>
            {(describedBy) => (
              <Input
                id={`${uid}-city`}
                aria-describedby={describedBy}
                value={values.city}
                onChange={(event) => set('city', event.target.value)}
              />
            )}
          </FieldShell>
        </div>
        <FieldShell id={`${uid}-cat`} label={t('categoryLabel')}>
          {() => (
            <ChipGroup label={t('categoryLabel')}>
              <Chip selected={values.category === ''} onClick={() => set('category', '')}>
                {t('allCategories')}
              </Chip>
              {Object.entries(VENDOR_CATEGORIES).map(([key, label]) => (
                <Chip key={key} selected={values.category === key} onClick={() => set('category', key)}>
                  {label}
                </Chip>
              ))}
            </ChipGroup>
          )}
        </FieldShell>
        <div className="grid grid-cols-2 gap-3">
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldShell id={`${uid}-rating`} label={t('ratingLabel')}>
            {(describedBy) => (
              <Select
                id={`${uid}-rating`}
                aria-describedby={describedBy}
                value={values.minRating}
                onValueChange={(value) => set('minRating', value)}
                options={[
                  { value: '', label: '—' },
                  { value: '3', label: '3+' },
                  { value: '4', label: '4+' },
                  { value: '4.5', label: '4.5+' },
                ]}
              />
            )}
          </FieldShell>
          <FieldShell id={`${uid}-sort`} label={t('sortLabel')}>
            {(describedBy) => (
              <Select
                id={`${uid}-sort`}
                aria-describedby={describedBy}
                value={values.sort}
                onValueChange={(value) => set('sort', value)}
                options={[
                  { value: 'rating', label: t('sortRating') },
                  { value: 'priceAsc', label: t('sortPriceAsc') },
                  { value: 'priceDesc', label: t('sortPriceDesc') },
                  { value: 'recent', label: t('sortRecent') },
                ]}
              />
            )}
          </FieldShell>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={values.verified} onCheckedChange={(checked) => set('verified', checked)} />
            {t('verifiedLabel')}
          </label>
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
        </div>
        <div className="flex gap-2">
          <Button onClick={apply}>{t('apply')}</Button>
          <Button
            variant="secondary"
            onClick={() => router.push(values.eventId ? `${base}?eventId=${values.eventId}` : base)}
          >
            {t('reset')}
          </Button>
        </div>
      </div>
    </Card>
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
    <Chip
      selected={saved}
      onClick={() =>
        void toggleShortlistAction({ eventId, orgId }).then((result) => {
          if (result.ok) setSaved(result.data.shortlisted);
        })
      }
    >
      {saved ? `♥ ${t('shortlisted')}` : `♡ ${t('shortlist')}`}
    </Chip>
  );
}
