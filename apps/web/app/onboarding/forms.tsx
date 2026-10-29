'use client';

import { Button, FieldShell, GuestShell, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { ActionResult } from '@/lib/action.js';
import { saveBusinessProfile, saveHostProfile } from './actions.js';

type Errors = Record<string, string | undefined>;

/** Shared submit: maps message keys to `onboarding.errors.*`, navigates on success. */
function useSubmit(save: () => Promise<ActionResult<unknown>>, to: string) {
  const router = useRouter();
  const t = useTranslations('onboarding.errors');
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    setErrors({});
    setSaving(true);
    try {
      const result = await save();
      if (result.ok) {
        router.push(to);
        return;
      }
      if (result.code === 'UNAUTHENTICATED') {
        router.push(`/login?next=${encodeURIComponent('/onboarding')}`);
        return;
      }
      if (result.fieldErrors) {
        setErrors(
          Object.fromEntries(
            Object.entries(result.fieldErrors).map(([field, keys]) => [field, t(keys?.[0] ?? 'generic')]),
          ),
        );
      } else {
        setErrors({ form: t(result.code === 'CONFLICT' ? 'alreadySetUp' : 'generic') });
      }
    } catch {
      setErrors({ form: t('generic') });
    } finally {
      setSaving(false);
    }
  }

  return { errors, saving, submit };
}

function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-danger mt-4 text-sm">
      {message}
    </p>
  );
}

export function HostProfileForm({ next }: { next: string }) {
  const t = useTranslations('onboarding');
  const [name, setName] = React.useState('');
  const { errors, saving, submit } = useSubmit(() => saveHostProfile({ name }), next);

  return (
    <GuestShell
      title={t('hostTitle')}
      action={
        <Button fullWidth loading={saving} onClick={() => void submit()}>
          {t('continue')}
        </Button>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FieldShell id="profile-name" label={t('nameLabel')} error={errors.name}>
          {(describedBy) => (
            <Input
              id="profile-name"
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.name)}
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FieldShell>
        <FormError message={errors.form} />
      </form>
    </GuestShell>
  );
}

export function BusinessForm({ kind, next, askName }: { kind: 'PLANNER' | 'VENDOR'; next: string; askName: boolean }) {
  const t = useTranslations('onboarding');
  const [ownerName, setOwnerName] = React.useState('');
  const [name, setName] = React.useState('');
  const [city, setCity] = React.useState('');
  const { errors, saving, submit } = useSubmit(
    () => saveBusinessProfile({ kind, name, city, ...(askName ? { ownerName } : {}) }),
    next,
  );

  return (
    <GuestShell
      title={kind === 'VENDOR' ? t('vendorTitle') : t('plannerTitle')}
      action={
        <Button fullWidth loading={saving} onClick={() => void submit()}>
          {t('continue')}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {askName && (
          <FieldShell id="owner-name" label={t('nameLabel')} error={errors.ownerName}>
            {(describedBy) => (
              <Input
                id="owner-name"
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.ownerName)}
                autoComplete="name"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
              />
            )}
          </FieldShell>
        )}
        <FieldShell id="business-name" label={t('businessName')} error={errors.name}>
          {(describedBy) => (
            <Input
              id="business-name"
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.name)}
              autoComplete="organization"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FieldShell>
        <FieldShell id="business-city" label={t('cityLabel')} hint={t('cityHint')} error={errors.city}>
          {(describedBy) => (
            <Input
              id="business-city"
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.city)}
              autoComplete="address-level2"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          )}
        </FieldShell>
        <button type="submit" hidden />
        <FormError message={errors.form} />
      </form>
    </GuestShell>
  );
}
