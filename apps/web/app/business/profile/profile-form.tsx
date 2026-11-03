'use client';

import { PLANNER_SPECIALTIES, VENDOR_CATEGORIES } from '@tiwa/config';
import { Banner, Button, Card, Chip, ChipGroup, FieldShell, Input, MoneyInput, Switch, Textarea } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { ActionResult } from '@/lib/action.js';
import { saveBusinessProfile } from './actions.js';

interface ProfileData {
  categories: string[];
  bio: string | null;
  city: string;
  serviceAreaKm: number;
  startingPriceMinor: string | null;
  currency: string;
  travelFeeNote: string | null;
  allowGuestEnquiries: boolean;
}

export function ProfileForm({
  orgId,
  initial,
  kind = 'VENDOR',
}: {
  orgId: string;
  initial: ProfileData | null;
  kind?: 'VENDOR' | 'PLANNER';
}) {
  const planner = kind === 'PLANNER';
  const options: Record<string, string> = planner ? PLANNER_SPECIALTIES : VENDOR_CATEGORIES;
  const t = useTranslations('business');
  const router = useRouter();
  const uid = React.useId();
  const [categories, setCategories] = React.useState<string[]>(initial?.categories ?? []);
  const [bio, setBio] = React.useState(initial?.bio ?? '');
  const [city, setCity] = React.useState(initial?.city ?? '');
  const [serviceAreaKm, setServiceAreaKm] = React.useState(String(initial?.serviceAreaKm ?? 50));
  const [price, setPrice] = React.useState(initial?.startingPriceMinor ?? '');
  const [travelFeeNote, setTravelFeeNote] = React.useState(initial?.travelFeeNote ?? '');
  const [allowGuestEnquiries, setAllowGuestEnquiries] = React.useState(initial?.allowGuestEnquiries ?? true);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  function toggleCategory(key: string) {
    setCategories((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : current.length >= 5
          ? current
          : [...current, key],
    );
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const result: ActionResult<unknown> = await saveBusinessProfile({
      orgId,
      categories,
      bio: bio || undefined,
      city,
      serviceAreaKm: Number(serviceAreaKm) || 50,
      startingPriceMinor: price || undefined,
      currency: initial?.currency ?? 'NGN',
      travelFeeNote: travelFeeNote || undefined,
      allowGuestEnquiries,
    });
    setSaving(false);
    if (!result.ok) setError(t(`errors.${result.code}`));
    else {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <Card>
      <form onSubmit={onSave} className="flex flex-col gap-4 p-4">
        <div>
          <h3 className="font-display text-lg font-bold">
            {planner ? t('plannerProfileHeading') : t('profileHeading')}
          </h3>
          {planner && <p className="text-muted text-sm">{t('plannerProfileBody')}</p>}
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        {saved && <Banner tone="info">{t('saved')}</Banner>}
        <FieldShell id={`${uid}-categories`} label={planner ? t('specialtiesLabel') : t('categoriesLabel')}>
          {() => (
            <ChipGroup label={planner ? t('specialtiesLabel') : t('categoriesLabel')}>
              {Object.entries(options).map(([key, label]) => (
                <Chip key={key} selected={categories.includes(key)} onClick={() => toggleCategory(key)}>
                  {label}
                </Chip>
              ))}
            </ChipGroup>
          )}
        </FieldShell>
        <FieldShell id={`${uid}-bio`} label={planner ? t('plannerBioLabel') : t('bioLabel')}>
          {(describedBy) => (
            <Textarea
              id={`${uid}-bio`}
              aria-describedby={describedBy}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              rows={planner ? 5 : 3}
              placeholder={planner ? t('plannerBioPlaceholder') : undefined}
            />
          )}
        </FieldShell>
        <div className="grid grid-cols-2 gap-4">
          <FieldShell id={`${uid}-city`} label={t('cityLabel')}>
            {(describedBy) => (
              <Input
                id={`${uid}-city`}
                aria-describedby={describedBy}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                required
              />
            )}
          </FieldShell>
          <FieldShell id={`${uid}-area`} label={t('serviceAreaLabel')}>
            {(describedBy) => (
              <Input
                id={`${uid}-area`}
                aria-describedby={describedBy}
                type="number"
                min={0}
                max={1000}
                value={serviceAreaKm}
                onChange={(event) => setServiceAreaKm(event.target.value)}
              />
            )}
          </FieldShell>
        </div>
        <FieldShell id={`${uid}-price`} label={planner ? t('plannerPriceLabel') : t('priceLabel')}>
          {(describedBy) => (
            <MoneyInput
              id={`${uid}-price`}
              aria-describedby={describedBy}
              value={price}
              onValueChange={setPrice}
              currency={initial?.currency ?? 'NGN'}
            />
          )}
        </FieldShell>
        <FieldShell id={`${uid}-travel`} label={planner ? t('plannerTermsLabel') : t('travelFeeLabel')}>
          {(describedBy) => (
            <Input
              id={`${uid}-travel`}
              aria-describedby={describedBy}
              value={travelFeeNote}
              onChange={(event) => setTravelFeeNote(event.target.value)}
            />
          )}
        </FieldShell>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={allowGuestEnquiries} onCheckedChange={setAllowGuestEnquiries} />
          {t('guestEnquiriesLabel')}
        </label>
        <div>
          <Button type="submit" disabled={saving || (!planner && categories.length === 0) || city.trim() === ''}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
