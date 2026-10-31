'use client';

import { DAY_SLOTS, VENUE_AMENITY_KEYS } from '@tiwa/config';
import { Button, Card, Checkbox, FieldShell, Input, MoneyInput, Select, Switch } from '@tiwa/ui';
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

/** P6-T09: venue search filters. */
export function VenueFilters({ base, initial }: { base: '/venues'; initial: VenueFilterValues }) {
  const t = useTranslations('marketplace');
  const router = useRouter();
  const uid = React.useId();
  const [values, setValues] = React.useState(initial);

  function apply() {
    const params = new URLSearchParams();
    if (values.city) params.set('city', values.city);
    if (values.date) params.set('date', values.date);
    if (values.slot) params.set('slot', values.slot);
    if (values.guests) params.set('guests', values.guests);
    if (values.indoor) params.set('indoor', '1');
    if (values.amenities.length > 0) params.set('amenities', values.amenities.join(','));
    if (values.maxPrice) params.set('maxPrice', values.maxPrice);
    if (values.eventId) params.set('eventId', values.eventId);
    router.push(`${base}?${params.toString()}`);
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldShell id={`${uid}-city`} label={t('cityLabel')}>
            {(describedBy) => (
              <Input
                id={`${uid}-city`}
                aria-describedby={describedBy}
                value={values.city}
                onChange={(event) => setValues((current) => ({ ...current, city: event.target.value }))}
              />
            )}
          </FieldShell>
          <FieldShell id={`${uid}-guests`} label={t('guestsLabel')}>
            {(describedBy) => (
              <Input
                id={`${uid}-guests`}
                aria-describedby={describedBy}
                type="number"
                min={1}
                value={values.guests}
                onChange={(event) => setValues((current) => ({ ...current, guests: event.target.value }))}
              />
            )}
          </FieldShell>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldShell id={`${uid}-date`} label={t('dateLabel')}>
            {(describedBy) => (
              <Input
                id={`${uid}-date`}
                aria-describedby={describedBy}
                type="date"
                value={values.date}
                onChange={(event) => setValues((current) => ({ ...current, date: event.target.value }))}
              />
            )}
          </FieldShell>
          <FieldShell id={`${uid}-slot`} label={t('slotLabel')}>
            {(describedBy) => (
              <Select
                id={`${uid}-slot`}
                aria-describedby={describedBy}
                value={values.slot}
                onValueChange={(slot) => setValues((current) => ({ ...current, slot }))}
                options={[{ value: '', label: t('allSlots') }, ...DAY_SLOTS.map((value) => ({ value, label: value }))]}
              />
            )}
          </FieldShell>
        </div>
        <FieldShell id={`${uid}-price`} label={t('maxPriceLabel')}>
          {(describedBy) => (
            <MoneyInput
              id={`${uid}-price`}
              aria-describedby={describedBy}
              value={values.maxPrice}
              onValueChange={(maxPrice) => setValues((current) => ({ ...current, maxPrice }))}
            />
          )}
        </FieldShell>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={values.indoor}
            onCheckedChange={(indoor) => setValues((current) => ({ ...current, indoor }))}
          />
          {t('indoorLabel')}
        </label>
        <FieldShell id={`${uid}-amen`} label={t('amenitiesLabel')}>
          {() => (
            <div className="flex flex-wrap gap-2">
              {VENUE_AMENITY_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-1 text-sm">
                  <Checkbox
                    checked={values.amenities.includes(key)}
                    onCheckedChange={() =>
                      setValues((current) => ({
                        ...current,
                        amenities: current.amenities.includes(key)
                          ? current.amenities.filter((item) => item !== key)
                          : [...current.amenities, key],
                      }))
                    }
                  />
                  {t(`amenity_${key}`)}
                </label>
              ))}
            </div>
          )}
        </FieldShell>
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
