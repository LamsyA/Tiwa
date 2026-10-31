'use client';

import { Banner, Button, Card, Input, Label, SegmentedControl, Select, Switch } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { rotateMomentsCode, saveMomentsSettings } from './actions.js';

export interface MomentsSettingsValue {
  privacy: 'GUESTS_ONLY' | 'LINK' | 'PUBLIC';
  moderation: 'INSTANT' | 'APPROVE_FIRST';
  slideshowDelaySec: number;
  guestDownloads: boolean;
  showFooter: boolean;
  accessCode: string | null;
}

/** Gallery settings (P5-T08): moderation mode, privacy, slideshow delay, footer. */
export function MomentsSettingsForm({
  eventId,
  initial,
  canEdit,
  plan,
}: {
  eventId: string;
  initial: MomentsSettingsValue;
  canEdit: boolean;
  plan: 'FREE' | 'PLUS';
}) {
  const t = useTranslations('events.momentsPage');
  const te = useTranslations('events.momentsPage.errors');
  const router = useRouter();
  const [value, setValue] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [saved, setSaved] = React.useState(false);
  const dirty = JSON.stringify({ ...value, accessCode: initial.accessCode }) !== JSON.stringify(initial);

  async function save() {
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      const result = await saveMomentsSettings({
        eventId,
        privacy: value.privacy,
        moderation: value.moderation,
        slideshowDelaySec: value.slideshowDelaySec,
        guestDownloads: value.guestDownloads,
        showFooter: value.showFooter,
      });
      if (!result.ok) {
        try {
          setError(te(result.code));
        } catch {
          setError(te('generic'));
        }
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError(te('generic'));
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    setBusy(true);
    try {
      const result = await rotateMomentsCode({ eventId });
      if (result.ok) {
        setValue((prev) => ({ ...prev, accessCode: result.data.accessCode }));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="font-medium">{t('settingsTitle')}</h3>
        <p className="text-muted text-sm">{t('settingsBody')}</p>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {saved && !dirty && <Banner tone="info">{t('saved')}</Banner>}
      <fieldset disabled={!canEdit || busy} className="flex flex-col gap-4 disabled:opacity-60">
        <div>
          <SegmentedControl
            ariaLabel={t('moderationLabel')}
            value={value.moderation}
            onValueChange={(next) => setValue((prev) => ({ ...prev, moderation: next as typeof prev.moderation }))}
            options={[
              { value: 'INSTANT', label: t('moderationInstant') },
              { value: 'APPROVE_FIRST', label: t('moderationApprove') },
            ]}
          />
        </div>
        <div>
          <Select
            id="moments-privacy"
            label={t('privacyLabel')}
            value={value.privacy}
            onValueChange={(next) => setValue((prev) => ({ ...prev, privacy: next as typeof prev.privacy }))}
            options={[
              { value: 'GUESTS_ONLY', label: t('privacyGuestsOnly') },
              { value: 'LINK', label: t('privacyLink') },
              { value: 'PUBLIC', label: t('privacyPublic') },
            ]}
          />
        </div>
        <div>
          <Label htmlFor="moments-delay">{t('delayLabel')}</Label>
          <Input
            id="moments-delay"
            type="number"
            min={5}
            max={300}
            value={String(value.slideshowDelaySec)}
            onChange={(event) =>
              setValue((prev) => ({
                ...prev,
                slideshowDelaySec: Math.min(300, Math.max(5, Number(event.target.value) || 5)),
              }))
            }
            className="max-w-32"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Switch
            checked={value.guestDownloads}
            onCheckedChange={(next) => setValue((prev) => ({ ...prev, guestDownloads: next }))}
            aria-label={t('downloadsLabel')}
          />
          {t('downloadsLabel')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Switch
            checked={plan === 'FREE' ? true : value.showFooter}
            disabled={plan === 'FREE'}
            onCheckedChange={(next) => setValue((prev) => ({ ...prev, showFooter: next }))}
            aria-label={t('footerLabel')}
          />
          {t('footerLabel')}
        </label>
        {plan === 'FREE' && <p className="text-muted text-xs">{t('footerPlusHint')}</p>}
        {value.privacy === 'GUESTS_ONLY' && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Label>{t('accessCodeLabel')}</Label>
              <p className="font-mono text-lg font-bold tracking-widest">{value.accessCode ?? '—'}</p>
            </div>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void rotate()}>
              {t('rotateCode')}
            </Button>
          </div>
        )}
      </fieldset>
      {canEdit && (
        <div>
          <Button type="button" loading={busy} disabled={!dirty} onClick={() => void save()}>
            {t('save')}
          </Button>
        </div>
      )}
    </Card>
  );
}
