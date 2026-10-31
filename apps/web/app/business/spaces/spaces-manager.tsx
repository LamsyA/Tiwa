'use client';

import { DAY_SLOTS, VENUE_AMENITY_KEYS } from '@tiwa/config';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DateField,
  FieldShell,
  Input,
  MoneyInput,
  Select,
  StatusPill,
  Switch,
  Textarea,
} from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  archiveVenueSpace,
  blockSpaceDate,
  completeVenuePhoto,
  removeVenuePhoto,
  saveVenueSettings,
  saveVenueSpace,
  startVenuePhoto,
  unblockSpaceDate,
} from './actions.js';

export interface SpacePhoto {
  key: string;
  url: string;
}

export interface SpaceRow {
  id: string;
  name: string;
  indoor: boolean;
  capacitySeated: number | null;
  capacityTheatre: number | null;
  capacityStanding: number | null;
  sizeSqm: number | null;
  amenities: string[];
  rules: string | null;
  slotPrices: Record<string, string>;
  setupMinutes: number;
  teardownMinutes: number;
  securityDepositMinor: string | null;
  active: boolean;
  photos: SpacePhoto[];
  blocks: { id: string; date: string; slot: string; reason: string | null }[];
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** P6-T08: venue spaces manager (settings, space forms, photos, per-space blocks). */
export function SpacesManager({
  orgId,
  currency,
  instantBook,
  holdHours,
  spaces,
  canManage,
}: {
  orgId: string;
  currency: string;
  instantBook: boolean;
  holdHours: number;
  spaces: SpaceRow[];
  canManage: boolean;
}) {
  const t = useTranslations('marketplace');
  const [creating, setCreating] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      {canManage && <VenueSettingsForm orgId={orgId} instantBook={instantBook} holdHours={holdHours} />}
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{t('spacesHeading')}</h2>
        {canManage && !creating && <Button onClick={() => setCreating(true)}>{t('addSpace')}</Button>}
      </div>
      {spaces.length === 0 && !creating && <p className="text-muted text-sm">{t('noSpaces')}</p>}
      {creating && <SpaceForm orgId={orgId} currency={currency} initial={null} onClose={() => setCreating(false)} />}
      {spaces.map((space) => (
        <SpaceCard key={space.id} orgId={orgId} currency={currency} space={space} canManage={canManage} />
      ))}
    </div>
  );
}

function VenueSettingsForm({
  orgId,
  instantBook,
  holdHours,
}: {
  orgId: string;
  instantBook: boolean;
  holdHours: number;
}) {
  const t = useTranslations('marketplace');
  const router = useRouter();
  const [instant, setInstant] = React.useState(instantBook);
  const [hours, setHours] = React.useState(String(holdHours));
  const [error, setError] = React.useState<string | null>(null);

  async function onSave() {
    setError(null);
    const result = await saveVenueSettings({ orgId, instantBook: instant, holdHours: Number(hours) || 72 });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={instant} onCheckedChange={setInstant} />
          {t('instantBookLabel')}
        </label>
        <div className="flex items-end gap-2">
          <FieldShell id="hold-hours" label={t('holdHoursLabel')}>
            {(describedBy) => (
              <Input
                id="hold-hours"
                aria-describedby={describedBy}
                type="number"
                min={1}
                max={720}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            )}
          </FieldShell>
          <Button variant="secondary" onClick={onSave}>
            {t('save')}
          </Button>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </Card>
  );
}

function SpaceCard({
  orgId,
  currency,
  space,
  canManage,
}: {
  orgId: string;
  currency: string;
  space: SpaceRow;
  canManage: boolean;
}) {
  const t = useTranslations('marketplace');
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onArchive() {
    const result = await archiveVenueSpace({ orgId, spaceId: space.id });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">{space.name}</h3>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing((open) => !open)}>
                {t('editSpace')}
              </Button>
              <ConfirmDialog
                trigger={<Button variant="secondary">{t('archiveSpace')}</Button>}
                title={t('archiveSpaceTitle', { name: space.name })}
                body={t('archiveBody')}
                confirmLabel={t('archiveSpace')}
                onConfirm={() => void onArchive()}
              />
            </div>
          )}
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        {editing ? (
          <SpaceForm orgId={orgId} currency={currency} initial={space} onClose={() => setEditing(false)} />
        ) : (
          <ul className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {space.capacitySeated !== null && <li>🪑 {space.capacitySeated}</li>}
            {space.sizeSqm !== null && <li>{space.sizeSqm} m²</li>}
            <li>{space.indoor ? t('indoorLabel') : t('outdoorLabel')}</li>
          </ul>
        )}
        <SpacePhotos orgId={orgId} spaceId={space.id} photos={space.photos} canManage={canManage} />
        <SpaceAvailability orgId={orgId} space={space} canManage={canManage} />
      </div>
    </Card>
  );
}

function SpaceForm({
  orgId,
  currency,
  initial,
  onClose,
}: {
  orgId: string;
  currency: string;
  initial: SpaceRow | null;
  onClose: () => void;
}) {
  const t = useTranslations('marketplace');
  const router = useRouter();
  const uid = React.useId();
  const [name, setName] = React.useState(initial?.name ?? '');
  const [indoor, setIndoor] = React.useState(initial?.indoor ?? true);
  const [seated, setSeated] = React.useState(initial?.capacitySeated?.toString() ?? '');
  const [theatre, setTheatre] = React.useState(initial?.capacityTheatre?.toString() ?? '');
  const [standing, setStanding] = React.useState(initial?.capacityStanding?.toString() ?? '');
  const [size, setSize] = React.useState(initial?.sizeSqm?.toString() ?? '');
  const [amenities, setAmenities] = React.useState<string[]>(initial?.amenities ?? []);
  const [rules, setRules] = React.useState(initial?.rules ?? '');
  const [prices, setPrices] = React.useState<Record<string, string>>(initial?.slotPrices ?? {});
  const [setup, setSetup] = React.useState(String(initial?.setupMinutes ?? 120));
  const [teardown, setTeardown] = React.useState(String(initial?.teardownMinutes ?? 60));
  const [deposit, setDeposit] = React.useState(initial?.securityDepositMinor ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function toggleAmenity(key: string) {
    setAmenities((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const num = (value: string) => (value.trim() === '' ? undefined : Number(value));
    const result = await saveVenueSpace({
      orgId,
      ...(initial ? { spaceId: initial.id } : {}),
      name,
      indoor,
      capacitySeated: num(seated),
      capacityTheatre: num(theatre),
      capacityStanding: num(standing),
      sizeSqm: num(size),
      amenities: amenities as never,
      rules: rules || undefined,
      slotPrices: prices,
      setupMinutes: Number(setup) || 120,
      teardownMinutes: Number(teardown) || 60,
      securityDepositMinor: deposit || undefined,
    });
    setSaving(false);
    if (!result.ok) setError(t(`errors.${result.code}`));
    else {
      onClose();
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSave} className="border-border flex flex-col gap-3 rounded-lg border p-3">
      {error && <Banner tone="danger">{error}</Banner>}
      <FieldShell id={`${uid}-name`} label={t('spaceName')}>
        {(describedBy) => (
          <Input
            id={`${uid}-name`}
            aria-describedby={describedBy}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        )}
      </FieldShell>
      <div className="grid grid-cols-3 gap-3">
        <FieldShell id={`${uid}-seated`} label={t('capSeated')}>
          {(describedBy) => (
            <Input
              id={`${uid}-seated`}
              aria-describedby={describedBy}
              type="number"
              min={0}
              value={seated}
              onChange={(event) => setSeated(event.target.value)}
            />
          )}
        </FieldShell>
        <FieldShell id={`${uid}-theatre`} label={t('capTheatre')}>
          {(describedBy) => (
            <Input
              id={`${uid}-theatre`}
              aria-describedby={describedBy}
              type="number"
              min={0}
              value={theatre}
              onChange={(event) => setTheatre(event.target.value)}
            />
          )}
        </FieldShell>
        <FieldShell id={`${uid}-standing`} label={t('capStanding')}>
          {(describedBy) => (
            <Input
              id={`${uid}-standing`}
              aria-describedby={describedBy}
              type="number"
              min={0}
              value={standing}
              onChange={(event) => setStanding(event.target.value)}
            />
          )}
        </FieldShell>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldShell id={`${uid}-size`} label={t('sizeLabel')}>
          {(describedBy) => (
            <Input
              id={`${uid}-size`}
              aria-describedby={describedBy}
              type="number"
              min={0}
              value={size}
              onChange={(event) => setSize(event.target.value)}
            />
          )}
        </FieldShell>
        <FieldShell id={`${uid}-deposit`} label={t('depositLabel')}>
          {(describedBy) => (
            <MoneyInput
              id={`${uid}-deposit`}
              aria-describedby={describedBy}
              value={deposit}
              onValueChange={setDeposit}
              currency={currency}
            />
          )}
        </FieldShell>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={indoor} onCheckedChange={setIndoor} />
        {t('indoorLabel')}
      </label>
      <FieldShell id={`${uid}-amen`} label={t('amenitiesLabel')}>
        {() => (
          <div className="flex flex-wrap gap-2">
            {VENUE_AMENITY_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-1 text-sm">
                <Checkbox checked={amenities.includes(key)} onCheckedChange={() => toggleAmenity(key)} />
                {t(`amenity_${key}`)}
              </label>
            ))}
          </div>
        )}
      </FieldShell>
      <FieldShell id={`${uid}-rules`} label={t('rulesLabel')}>
        {(describedBy) => (
          <Textarea
            id={`${uid}-rules`}
            aria-describedby={describedBy}
            value={rules}
            onChange={(event) => setRules(event.target.value)}
            rows={2}
          />
        )}
      </FieldShell>
      <FieldShell id={`${uid}-prices`} label={t('slotPricesLabel')}>
        {() => (
          <div className="grid grid-cols-2 gap-2">
            {DAY_SLOTS.map((slot) => (
              <div key={slot} className="flex items-center gap-2">
                <span className="w-24 text-sm">{slot}</span>
                <MoneyInput
                  value={prices[slot] ?? ''}
                  onValueChange={(value) => setPrices((current) => ({ ...current, [slot]: value }))}
                  currency={currency}
                />
              </div>
            ))}
          </div>
        )}
      </FieldShell>
      <div className="grid grid-cols-2 gap-3">
        <FieldShell id={`${uid}-setup`} label={t('setupLabel')}>
          {(describedBy) => (
            <Input
              id={`${uid}-setup`}
              aria-describedby={describedBy}
              type="number"
              min={0}
              value={setup}
              onChange={(event) => setSetup(event.target.value)}
            />
          )}
        </FieldShell>
        <FieldShell id={`${uid}-teardown`} label={t('teardownLabel')}>
          {(describedBy) => (
            <Input
              id={`${uid}-teardown`}
              aria-describedby={describedBy}
              type="number"
              min={0}
              value={teardown}
              onChange={(event) => setTeardown(event.target.value)}
            />
          )}
        </FieldShell>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || name.trim() === ''}>
          {t('save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

function SpacePhotos({
  orgId,
  spaceId,
  photos,
  canManage,
}: {
  orgId: string;
  spaceId: string;
  photos: SpacePhoto[];
  canManage: boolean;
}) {
  const t = useTranslations('marketplace');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const started = await startVenuePhoto({ orgId, spaceId, mime: file.type, sizeBytes: file.size });
        if (!started.ok) throw new Error(started.code);
        const put = await fetch(started.data.uploadUrl, { method: 'PUT', body: file });
        if (!put.ok) throw new Error('UPLOAD_FAILED');
        const done = await completeVenuePhoto({ orgId, spaceId, storageKey: started.data.storageKey });
        if (!done.ok) throw new Error(done.code);
      }
      router.refresh();
    } catch {
      setError(t('errors.generic'));
    } finally {
      setUploading(false);
    }
  }

  async function onRemove(key: string) {
    const result = await removeVenuePhoto({ orgId, spaceId, storageKey: key });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{t('spacePhotos')}</h4>
        {canManage && (
          <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? t('uploading') : t('uploadPhotos')}
          </Button>
        )}
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={onFiles} />
      {photos.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {photos.map((photo) => (
            <li key={photo.key} className="group relative aspect-square overflow-hidden rounded-lg">
              <img src={photo.url} alt={t('spacePhotoAlt')} className="size-full object-cover" loading="lazy" />
              {canManage && (
                <ConfirmDialog
                  trigger={
                    <button
                      type="button"
                      aria-label={t('removePhoto')}
                      className="bg-surface/90 absolute top-1 right-1 rounded-full px-2 py-1 text-xs"
                    >
                      ✕
                    </button>
                  }
                  title={t('removePhotoTitle')}
                  body={t('archiveBody')}
                  confirmLabel={t('removePhoto')}
                  onConfirm={() => void onRemove(photo.key)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpaceAvailability({ orgId, space, canManage }: { orgId: string; space: SpaceRow; canManage: boolean }) {
  const t = useTranslations('marketplace');
  const router = useRouter();
  const [date, setDate] = React.useState('');
  const [slot, setSlot] = React.useState<string>('FULL_DAY');
  const [error, setError] = React.useState<string | null>(null);

  async function onBlock(event: React.FormEvent) {
    event.preventDefault();
    if (!date) return;
    const result = await blockSpaceDate({ orgId, spaceId: space.id, date, slot: slot as 'FULL_DAY' });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else {
      setDate('');
      router.refresh();
    }
  }

  async function onUnblock(blockId: string) {
    const result = await unblockSpaceDate({ orgId, blockId });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{t('spaceAvailability')}</h4>
      {error && <Banner tone="danger">{error}</Banner>}
      {canManage && (
        <form onSubmit={onBlock} className="flex flex-wrap items-end gap-2">
          <FieldShell id={`block-${space.id}-date`} label={t('blockDate')}>
            {(describedBy) => (
              <DateField
                id={`block-${space.id}-date`}
                aria-describedby={describedBy}
                value={date}
                onValueChange={setDate}
              />
            )}
          </FieldShell>
          <FieldShell id={`block-${space.id}-slot`} label="Slot">
            {(describedBy) => (
              <Select
                id={`block-${space.id}-slot`}
                aria-describedby={describedBy}
                value={slot}
                onValueChange={setSlot}
                options={DAY_SLOTS.map((value) => ({ value, label: value }))}
              />
            )}
          </FieldShell>
          <Button type="submit" variant="secondary" disabled={!date}>
            {t('blockDate')}
          </Button>
        </form>
      )}
      {space.blocks.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {space.blocks.map((block) => (
            <li key={block.id} className="border-border flex items-center gap-2 rounded-full border px-3 py-1">
              <span>
                {block.date.slice(0, 10)} · {block.slot}
              </span>
              {canManage && (
                <button type="button" className="underline" onClick={() => void onUnblock(block.id)}>
                  {t('unblock')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AvailabilityStatus({ fresh }: { fresh: boolean }) {
  const t = useTranslations('marketplace');
  return <StatusPill tone={fresh ? 'success' : 'warning'}>{fresh ? t('done') : t('pending')}</StatusPill>;
}
