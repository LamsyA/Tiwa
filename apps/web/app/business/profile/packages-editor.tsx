'use client';

import { Banner, Button, Card, ConfirmDialog, FieldShell, Input, MoneyInput, StatusPill, Textarea } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { archiveBusinessPackage, saveBusinessPackage } from './actions.js';

interface PackageRow {
  id: string;
  name: string;
  description: string | null;
  priceMinor: string | null;
  currency: string;
  includes: string[];
  addOns: string[];
  active: boolean;
}

export function PackagesEditor({ orgId, packages }: { orgId: string; packages: PackageRow[] }) {
  const t = useTranslations('business');
  const router = useRouter();
  const [editing, setEditing] = React.useState<PackageRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onArchive(packageId: string) {
    const result = await archiveBusinessPackage({ orgId, packageId });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{t('packagesHeading')}</h3>
          {!creating && !editing && <Button onClick={() => setCreating(true)}>{t('addPackage')}</Button>}
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        {packages.filter((row) => row.active).length === 0 && !creating && !editing && (
          <p className="text-muted text-sm">{t('noPackages')}</p>
        )}
        <ul className="flex flex-col gap-2">
          {packages
            .filter((row) => row.active)
            .map((row) => (
              <li key={row.id} className="border-border flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="text-muted truncate text-sm">{row.includes.slice(0, 3).join(' · ')}</p>
                </div>
                <Button variant="secondary" onClick={() => setEditing(row)}>
                  {t('editPackage')}
                </Button>
                <ConfirmDialog
                  trigger={<Button variant="secondary">{t('archivePackage')}</Button>}
                  title={t('archiveTitle', { name: row.name })}
                  body={t('archiveBody')}
                  confirmLabel={t('archivePackage')}
                  onConfirm={() => void onArchive(row.id)}
                />
              </li>
            ))}
        </ul>
        {(creating || editing) && (
          <PackageForm
            orgId={orgId}
            initial={editing}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        )}
      </div>
    </Card>
  );
}

function PackageForm({ orgId, initial, onClose }: { orgId: string; initial: PackageRow | null; onClose: () => void }) {
  const t = useTranslations('business');
  const router = useRouter();
  const uid = React.useId();
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [price, setPrice] = React.useState(initial?.priceMinor ?? '');
  const [includes, setIncludes] = React.useState((initial?.includes ?? []).join('\n'));
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveBusinessPackage({
      orgId,
      packageId: initial?.id,
      name,
      description: description || undefined,
      priceMinor: price || undefined,
      currency: initial?.currency ?? 'NGN',
      includes: includes
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    });
    setSaving(false);
    if (!result.ok) setError(t(`errors.${result.code}`));
    else {
      onClose();
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSave} className="border-border flex flex-col gap-4 rounded-lg border p-3">
      {error && <Banner tone="danger">{error}</Banner>}
      <FieldShell id={`${uid}-name`} label={t('packageName')}>
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
      <FieldShell id={`${uid}-desc`} label={t('packageDescription')}>
        {(describedBy) => (
          <Textarea
            id={`${uid}-desc`}
            aria-describedby={describedBy}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />
        )}
      </FieldShell>
      <FieldShell id={`${uid}-price`} label={t('packagePrice')}>
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
      <FieldShell id={`${uid}-includes`} label={t('packageIncludes')}>
        {(describedBy) => (
          <Textarea
            id={`${uid}-includes`}
            aria-describedby={describedBy}
            value={includes}
            onChange={(event) => setIncludes(event.target.value)}
            rows={3}
          />
        )}
      </FieldShell>
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

export function PackageStatus({ active }: { active: boolean }) {
  const t = useTranslations('business');
  return <StatusPill tone={active ? 'success' : 'neutral'}>{active ? t('done') : t('pending')}</StatusPill>;
}
