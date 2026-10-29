'use client';

import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DateField,
  FieldShell,
  Input,
  Select,
  Switch,
  Textarea,
  TimeField,
  cn,
} from '@tiwa/ui';
import { ImagePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { ActionResult } from '@/lib/action.js';
import {
  cancelThisEvent,
  completeCover,
  removeEventCover,
  saveEventAppearance,
  saveEventDetails,
  saveEventFeatures,
  startCover,
} from './actions.js';

type Visibility = 'PRIVATE' | 'LINK_ONLY' | 'PUBLIC';

export interface SettingsFormsProps {
  eventId: string;
  canEdit: boolean;
  isHost: boolean;
  status: string;
  eventName: string;
  details: {
    name: string;
    description: string;
    date: string;
    startTime: string;
    endTime: string;
    expectedGuests: number | null;
  };
  features: { visibility: Visibility; invites: boolean; moments: boolean; tickets: boolean };
  allowedVisibilities: string[];
  ticketsAllowed: boolean;
  themeColor: string | null;
  coverUrl: string | null;
}

function useErrorText() {
  const t = useTranslations('events.settingsPage.errors');
  return (result: Extract<ActionResult<unknown>, { ok: false }>): string => {
    const key = result.fieldErrors ? Object.values(result.fieldErrors).flat()[0] : undefined;
    if (key && t.has(key)) return t(key);
    if (t.has(result.code)) return t(result.code);
    return t('generic');
  };
}

function useRun() {
  const router = useRouter();
  const errorText = useErrorText();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [saved, setSaved] = React.useState(false);

  async function run(work: () => Promise<ActionResult<unknown>>): Promise<boolean> {
    setSaving(true);
    setError(undefined);
    setSaved(false);
    try {
      const result = await work();
      if (result.ok) {
        setSaved(true);
        router.refresh();
        return true;
      }
      setError(errorText(result));
      return false;
    } catch {
      setError(errorText({ ok: false, code: 'INTERNAL' }));
      return false;
    } finally {
      setSaving(false);
    }
  }
  return { run, saving, error, saved };
}

function Feedback({ error, saved }: { error?: string | undefined; saved: boolean }) {
  const t = useTranslations('events.settingsPage');
  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      {saved && (
        <p role="status" className="text-success text-sm">
          {t('saved')}
        </p>
      )}
    </>
  );
}

export function SettingsForms(props: SettingsFormsProps) {
  return (
    <div className="flex flex-col gap-4">
      <DetailsForm {...props} />
      <FeaturesForm {...props} />
      <AppearanceForm {...props} />
      {props.isHost && props.status !== 'CANCELLED' && props.status !== 'COMPLETED' && <DangerZone {...props} />}
    </div>
  );
}

function DetailsForm({ eventId, canEdit, details }: SettingsFormsProps) {
  const t = useTranslations('events.settingsPage');
  const { run, saving, error, saved } = useRun();
  const [name, setName] = React.useState(details.name);
  const [description, setDescription] = React.useState(details.description);
  const [date, setDate] = React.useState(details.date);
  const [startTime, setStartTime] = React.useState(details.startTime);
  const [endTime, setEndTime] = React.useState(details.endTime);
  const [guests, setGuests] = React.useState(details.expectedGuests?.toString() ?? '');
  const disabled = !canEdit;

  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() =>
            saveEventDetails({
              eventId,
              name,
              description: description.trim() === '' ? null : description,
              date,
              startTime,
              endTime: endTime === '' ? null : endTime,
              expectedGuests: guests.trim() === '' ? null : Number(guests),
            }),
          );
        }}
      >
        <h3 className="font-medium">{t('detailsHeading')}</h3>
        <Feedback error={error} saved={saved} />
        <FieldShell id="settings-name" label={t('nameLabel')}>
          {(describedBy) => (
            <Input
              id="settings-name"
              aria-describedby={describedBy}
              value={name}
              disabled={disabled}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FieldShell>
        <FieldShell id="settings-description" label={t('descriptionLabel')}>
          {(describedBy) => (
            <Textarea
              id="settings-description"
              aria-describedby={describedBy}
              value={description}
              disabled={disabled}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </FieldShell>
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldShell id="settings-date" label={t('dateLabel')}>
            {(describedBy) => (
              <DateField
                id="settings-date"
                aria-describedby={describedBy}
                value={date}
                disabled={disabled}
                onValueChange={setDate}
              />
            )}
          </FieldShell>
          <FieldShell id="settings-start" label={t('startLabel')}>
            {(describedBy) => (
              <TimeField
                id="settings-start"
                aria-describedby={describedBy}
                value={startTime}
                disabled={disabled}
                onValueChange={setStartTime}
              />
            )}
          </FieldShell>
          <FieldShell id="settings-end" label={t('endLabel')}>
            {(describedBy) => (
              <TimeField
                id="settings-end"
                aria-describedby={describedBy}
                value={endTime}
                disabled={disabled}
                onValueChange={setEndTime}
              />
            )}
          </FieldShell>
        </div>
        <FieldShell id="settings-guests" label={t('guestsLabel')}>
          {(describedBy) => (
            <Input
              id="settings-guests"
              aria-describedby={describedBy}
              type="number"
              min={1}
              inputMode="numeric"
              value={guests}
              disabled={disabled}
              onChange={(event) => setGuests(event.target.value)}
            />
          )}
        </FieldShell>
        {canEdit && (
          <div>
            <Button type="submit" loading={saving}>
              {t('save')}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function FeatureRow({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-muted text-sm">{help}</p>
      </div>
      <Switch aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function FeaturesForm({ eventId, canEdit, features, allowedVisibilities, ticketsAllowed }: SettingsFormsProps) {
  const t = useTranslations('events.settingsPage');
  const te = useTranslations('events');
  const { run, saving, error, saved } = useRun();
  const [visibility, setVisibility] = React.useState<Visibility>(features.visibility);
  const [invites, setInvites] = React.useState(features.invites);
  const [moments, setMoments] = React.useState(features.moments);
  const [tickets, setTickets] = React.useState(features.tickets);
  const ticketsDisabled = !canEdit || visibility !== 'PUBLIC' || !ticketsAllowed;

  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() =>
            saveEventFeatures({
              eventId,
              visibility,
              invites,
              moments,
              tickets: visibility === 'PUBLIC' && ticketsAllowed ? tickets : false,
            }),
          );
        }}
      >
        <h3 className="font-medium">{t('featuresHeading')}</h3>
        <Feedback error={error} saved={saved} />
        <Select
          label={t('visibilityLabel')}
          value={visibility}
          disabled={!canEdit}
          options={allowedVisibilities.map((value) => ({
            value,
            label: te(`visibility.${value}` as 'visibility.PRIVATE'),
          }))}
          onValueChange={(value) => setVisibility(value as Visibility)}
        />
        <FeatureRow
          label={te('featureInvites')}
          help={te('featureInvitesHelp')}
          checked={invites}
          disabled={!canEdit}
          onChange={setInvites}
        />
        <FeatureRow
          label={te('featureMoments')}
          help={te('featureMomentsHelp')}
          checked={moments}
          disabled={!canEdit}
          onChange={setMoments}
        />
        <FeatureRow
          label={te('featureTickets')}
          help={te('featureTicketsHelp')}
          checked={tickets && !ticketsDisabled}
          disabled={ticketsDisabled}
          onChange={setTickets}
        />
        {visibility !== 'PUBLIC' && ticketsAllowed && <p className="text-muted text-sm">{t('ticketsNeedPublic')}</p>}
        {canEdit && (
          <div>
            <Button type="submit" loading={saving}>
              {t('save')}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

const THEME_PRESETS = ['#e5532d', '#b83a17', '#15803d', '#2563eb', '#7c3aed', '#b45309', '#0f766e', '#be185d'];
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_COVER_BYTES = 5 * 1024 * 1024;

function AppearanceForm({ eventId, canEdit, themeColor, coverUrl }: SettingsFormsProps) {
  const t = useTranslations('events.settingsPage');
  const { run, saving, error, saved } = useRun();
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const [color, setColor] = React.useState(themeColor ?? '');
  const [coverBusy, setCoverBusy] = React.useState(false);
  const [coverError, setCoverError] = React.useState<string | undefined>();

  async function upload(file: File | undefined) {
    if (!file) return;
    setCoverError(undefined);
    if (!COVER_TYPES.includes(file.type)) return setCoverError(t('errors.coverType'));
    if (file.size > MAX_COVER_BYTES) return setCoverError(t('errors.coverTooLarge'));
    setCoverBusy(true);
    try {
      const started = await startCover({ eventId, mime: file.type as 'image/jpeg', sizeBytes: file.size });
      if (!started.ok) return setCoverError(t('errors.coverFailed'));
      const put = await fetch(started.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      }).catch(() => null);
      if (!put?.ok) return setCoverError(t('errors.coverFailed'));
      const completed = await completeCover({
        eventId,
        key: started.data.key,
        mime: file.type as 'image/jpeg',
        sizeBytes: file.size,
      });
      if (!completed.ok) return setCoverError(t('errors.coverMismatch'));
      router.refresh();
    } finally {
      setCoverBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4">
        <h3 className="font-medium">{t('appearanceHeading')}</h3>
        <div className="flex flex-col gap-2">
          <p className="font-medium">{t('coverLabel')}</p>
          {coverUrl ? (
            // Signed storage URL; next/image would need remote patterns for every bucket host.
            <img src={coverUrl} alt={t('coverAlt')} className="aspect-[16/9] w-full rounded-md object-cover" />
          ) : (
            <p className="text-muted text-sm">{t('coverHint')}</p>
          )}
          {coverError && <Banner tone="danger">{coverError}</Banner>}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={input}
                id="cover-file"
                type="file"
                accept={COVER_TYPES.join(',')}
                className="sr-only"
                onChange={(event) => void upload(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="secondary"
                loading={coverBusy}
                onClick={() => input.current?.click()}
                iconLeft={<ImagePlus aria-hidden className="size-5" />}
              >
                {coverUrl ? t('coverReplace') : t('coverUpload')}
              </Button>
              {coverUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void run(() => removeEventCover({ eventId })).then(() => router.refresh())}
                >
                  {t('coverRemove')}
                </Button>
              )}
            </div>
          )}
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => saveEventAppearance({ eventId, themeColor: color === '' ? null : color }));
          }}
        >
          <Feedback error={error} saved={saved} />
          <FieldShell id="settings-theme" label={t('themeLabel')} hint={t('themeHint')}>
            {(describedBy) => (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setColor('')}
                    className={cn(
                      'min-h-11 rounded-md border px-3 text-sm font-medium',
                      color === '' ? 'border-brand-strong text-brand-strong' : 'border-border',
                    )}
                  >
                    {t('themeAuto')}
                  </button>
                  {THEME_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={!canEdit}
                      aria-label={preset}
                      onClick={() => setColor(preset)}
                      className={cn(
                        'size-11 rounded-md border-2',
                        color === preset ? 'border-text' : 'border-transparent',
                      )}
                      style={{ backgroundColor: preset }}
                    />
                  ))}
                </div>
                <Input
                  id="settings-theme"
                  aria-describedby={describedBy}
                  value={color}
                  placeholder={t('themePlaceholder')}
                  disabled={!canEdit}
                  onChange={(event) => setColor(event.target.value)}
                />
              </div>
            )}
          </FieldShell>
          {canEdit && (
            <div>
              <Button type="submit" loading={saving}>
                {t('save')}
              </Button>
            </div>
          )}
        </form>
      </div>
    </Card>
  );
}

function DangerZone({ eventId, eventName }: SettingsFormsProps) {
  const t = useTranslations('events.settingsPage');
  const { run, error } = useRun();
  const router = useRouter();
  return (
    <Card className="border-danger p-4">
      <div className="flex flex-col gap-3">
        <h3 className="text-danger font-medium">{t('dangerHeading')}</h3>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-muted min-w-0 flex-1 text-sm">{t('cancelBody')}</p>
          <ConfirmDialog
            destructive
            requireText={eventName}
            trigger={
              <Button variant="destructive" type="button">
                {t('cancelTitle')}
              </Button>
            }
            title={t('cancelTitle')}
            body={t('cancelBody')}
            confirmLabel={t('cancelConfirm')}
            onConfirm={() =>
              void run(() => cancelThisEvent({ eventId })).then((ok) => {
                if (ok) router.push('/events');
              })
            }
          />
        </div>
      </div>
    </Card>
  );
}
