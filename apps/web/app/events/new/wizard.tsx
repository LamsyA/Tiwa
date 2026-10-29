'use client';

import type { EventFormat, Visibility } from '@tiwa/config/event-types';
import {
  Banner,
  Button,
  Card,
  DateField,
  FieldShell,
  Input,
  MoneyInput,
  RadioGroup,
  RadioItem,
  Stepper,
  Switch,
  TimeField,
} from '@tiwa/ui';
import { CalendarDays, MapPin, Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { ActionResult } from '@/lib/action.js';
import { createEvent, saveWizardStep, startEventDraft } from './actions.js';

type Step = 'type' | 'basics' | 'venue' | 'guests' | 'features';
const STEPS: Step[] = ['type', 'basics', 'venue', 'guests', 'features'];

interface Day {
  date: string;
  title: string;
  venueName: string;
  address: string;
}

export interface WizardDraft {
  id: string;
  typeLabel: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  days: Day[];
  expectedGuests: string;
  budgetMinor: string;
  currency: string;
  visibility: Visibility;
  visibilities: Visibility[];
  ticketsAllowed: boolean;
  features: { invites: boolean; moments: boolean; tickets: boolean };
}

interface TypeCard {
  key: string;
  format: EventFormat;
  label: string;
  blurb: string;
}

type Errors = Record<string, string>;

/** Field errors arrive as message keys; anything unknown reads as the generic message. */
function useErrorText() {
  const t = useTranslations('events.errors');
  return (result: Extract<ActionResult<unknown>, { ok: false }>): Errors => {
    const known = (key: string | undefined) => (key && t.has(key) ? t(key) : t('generic'));
    if (!result.fieldErrors) return { form: known(undefined) };
    const out: Errors = {};
    for (const [field, keys] of Object.entries(result.fieldErrors)) {
      // Nested paths (days.0.date) collapse to their first segment.
      out[field.split('.')[0] ?? field] = known(keys?.[0]);
    }
    return out;
  };
}

export function Wizard({
  step,
  draft,
  types,
  formats,
}: {
  step: Step;
  draft: WizardDraft | null;
  types: TypeCard[];
  formats: { key: EventFormat; label: string }[];
}) {
  const t = useTranslations('events');
  const index = STEPS.indexOf(step);
  return (
    <div className="flex flex-col gap-6 py-2">
      <Stepper ariaLabel={t('newTitle')} active={index} steps={STEPS.map((key) => ({ label: t(`steps.${key}`) }))} />
      {step === 'type' || !draft ? (
        <TypeStep types={types} formats={formats} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <StepForm key={step} step={step} draft={draft} />
          <Preview draft={draft} />
        </div>
      )}
    </div>
  );
}

function TypeStep({ types, formats }: { types: TypeCard[]; formats: { key: EventFormat; label: string }[] }) {
  const t = useTranslations('events');
  const router = useRouter();
  const errorText = useErrorText();
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const needle = query.trim().toLowerCase();
  const visible = needle ? types.filter((type) => `${type.label} ${type.blurb}`.toLowerCase().includes(needle)) : types;

  async function pick(key: string) {
    setBusy(key);
    setError(undefined);
    try {
      const result = await startEventDraft({ type: key });
      if (result.ok) router.push(`/events/new?id=${result.data.eventId}&step=basics`);
      else setError(errorText(result).form ?? errorText(result).type);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="type-heading" className="flex flex-col gap-4">
      <h2 id="type-heading" className="font-display text-xl font-bold">
        {t('typeHeading')}
      </h2>
      <div className="relative">
        <Search
          aria-hidden
          className="text-muted pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
        />
        <Input
          type="search"
          aria-label={t('typeSearch')}
          placeholder={t('typeSearch')}
          className="pl-10"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {visible.length === 0 && <p className="text-muted">{t('typeEmpty', { query })}</p>}
      {formats.map((format) => {
        const inFormat = visible.filter((type) => type.format === format.key);
        if (inFormat.length === 0) return null;
        return (
          <div key={format.key} className="flex flex-col gap-2">
            <h3 className="text-muted text-sm font-medium uppercase tracking-wide">{format.label}</h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {inFormat.map((type) => (
                <li key={type.key}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    aria-busy={busy === type.key || undefined}
                    onClick={() => void pick(type.key)}
                    className="border-border bg-surface shadow-1 duration-fast hover:border-brand-strong focus-visible:outline-focus flex min-h-[72px] w-full flex-col items-start rounded-lg border p-3 text-left transition-transform ease-out focus-visible:outline-2 active:scale-[0.99] disabled:opacity-60"
                  >
                    <span className="font-medium">{type.label}</span>
                    <span className="text-muted text-sm">{type.blurb}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function StepForm({ step, draft }: { step: Exclude<Step, 'type'>; draft: WizardDraft }) {
  const t = useTranslations('events');
  const router = useRouter();
  const errorText = useErrorText();
  const [state, setState] = React.useState(() => ({
    ...draft,
    days: draft.days.length ? draft.days : [{ date: draft.date, title: '', venueName: '', address: '' }],
  }));
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) =>
    setState((current) => ({ ...current, [key]: value }));
  const today = new Date().toISOString().slice(0, 10);

  function payload() {
    switch (step) {
      case 'basics':
        return {
          eventId: draft.id,
          step,
          data: {
            name: state.name,
            date: state.date,
            startTime: state.startTime,
            ...(state.endTime ? { endTime: state.endTime } : {}),
          },
        } as const;
      case 'venue':
        return {
          eventId: draft.id,
          step,
          data: {
            days: state.days.map((day) => ({
              date: day.date,
              ...(day.title ? { title: day.title } : {}),
              ...(day.venueName ? { venueName: day.venueName } : {}),
              ...(day.address ? { address: day.address } : {}),
            })),
          },
        } as const;
      case 'guests':
        return {
          eventId: draft.id,
          step,
          data: {
            expectedGuests: state.expectedGuests,
            budgetMinor: state.budgetMinor || '0',
            visibility: state.visibility,
          },
        } as const;
      case 'features':
        return { eventId: draft.id, step, data: state.features } as const;
    }
  }

  async function next() {
    setErrors({});
    setSaving(true);
    try {
      const saved = await saveWizardStep(payload());
      if (!saved.ok) {
        setErrors(errorText(saved));
        return;
      }
      if (step !== 'features') {
        router.push(`/events/new?id=${draft.id}&step=${STEPS[STEPS.indexOf(step) + 1]}`);
        return;
      }
      const created = await createEvent({ eventId: draft.id });
      if (created.ok) router.push(`/events/${draft.id}?welcome=1`);
      else setErrors(errorText(created));
    } catch {
      setErrors({ form: t('errors.generic') });
    } finally {
      setSaving(false);
    }
  }

  const back = STEPS[STEPS.indexOf(step) - 1];
  const headings: Record<typeof step, string> = {
    basics: t('basicsHeading'),
    venue: t('venueHeading'),
    guests: t('guestsHeading'),
    features: t('featuresHeading'),
  };

  return (
    <form
      className="flex flex-col gap-5"
      aria-labelledby="step-heading"
      onSubmit={(event) => {
        event.preventDefault();
        void next();
      }}
    >
      <h2 id="step-heading" className="font-display text-xl font-bold">
        {headings[step]}
      </h2>
      {errors.form && <Banner tone="danger">{errors.form}</Banner>}

      {step === 'basics' && (
        <>
          <FieldShell id="event-name" label={t('nameLabel')} error={errors.name}>
            {(describedBy) => (
              <Input
                id="event-name"
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.name)}
                value={state.name}
                onChange={(event) => set('name', event.target.value)}
              />
            )}
          </FieldShell>
          <FieldShell id="event-date" label={t('dateLabel')} error={errors.date}>
            {(describedBy) => (
              <DateField
                id="event-date"
                aria-describedby={describedBy}
                error={Boolean(errors.date)}
                value={state.date}
                onValueChange={(value) => set('date', value)}
              />
            )}
          </FieldShell>
          {state.date && state.date < today && <Banner tone="warning">{t('pastDateWarning')}</Banner>}
          <div className="grid grid-cols-2 gap-3">
            <FieldShell id="event-start" label={t('startLabel')} error={errors.startTime}>
              {(describedBy) => (
                <TimeField
                  id="event-start"
                  aria-describedby={describedBy}
                  error={Boolean(errors.startTime)}
                  value={state.startTime}
                  onValueChange={(value) => set('startTime', value)}
                />
              )}
            </FieldShell>
            <FieldShell id="event-end" label={t('endLabel')} error={errors.endTime}>
              {(describedBy) => (
                <TimeField
                  id="event-end"
                  aria-describedby={describedBy}
                  value={state.endTime}
                  onValueChange={(value) => set('endTime', value)}
                />
              )}
            </FieldShell>
          </div>
        </>
      )}

      {step === 'venue' && (
        <>
          {errors.days && <Banner tone="danger">{errors.days}</Banner>}
          {state.days.map((day, dayIndex) => {
            const update = (patch: Partial<Day>) =>
              set(
                'days',
                state.days.map((existing, i) => (i === dayIndex ? { ...existing, ...patch } : existing)),
              );
            const n = dayIndex + 1;
            return (
              <fieldset key={dayIndex} className="border-border flex flex-col gap-3 rounded-lg border p-4">
                <legend className="px-1 font-medium">{t('dayLabel', { n })}</legend>
                <FieldShell id={`day-${n}-date`} label={t('dateLabel')}>
                  {(describedBy) => (
                    <DateField
                      id={`day-${n}-date`}
                      aria-describedby={describedBy}
                      value={day.date}
                      onValueChange={(value) => update({ date: value })}
                    />
                  )}
                </FieldShell>
                {state.days.length > 1 && (
                  <FieldShell id={`day-${n}-title`} label={t('dayTitleLabel')}>
                    {(describedBy) => (
                      <Input
                        id={`day-${n}-title`}
                        aria-describedby={describedBy}
                        value={day.title}
                        onChange={(event) => update({ title: event.target.value })}
                      />
                    )}
                  </FieldShell>
                )}
                <FieldShell id={`day-${n}-venue`} label={t('venueNameLabel')}>
                  {(describedBy) => (
                    <Input
                      id={`day-${n}-venue`}
                      aria-describedby={describedBy}
                      placeholder={t('venueNamePlaceholder')}
                      value={day.venueName}
                      onChange={(event) => update({ venueName: event.target.value })}
                    />
                  )}
                </FieldShell>
                <FieldShell id={`day-${n}-address`} label={t('addressLabel')}>
                  {(describedBy) => (
                    <Input
                      id={`day-${n}-address`}
                      aria-describedby={describedBy}
                      autoComplete="street-address"
                      value={day.address}
                      onChange={(event) => update({ address: event.target.value })}
                    />
                  )}
                </FieldShell>
                {state.days.length > 1 && (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        set(
                          'days',
                          state.days.filter((_, i) => i !== dayIndex),
                        )
                      }
                    >
                      {t('removeDay', { n })}
                    </Button>
                  </div>
                )}
              </fieldset>
            );
          })}
          {state.days.length < 14 && (
            <div>
              <Button
                variant="secondary"
                onClick={() =>
                  set('days', [
                    ...state.days,
                    { date: state.days.at(-1)?.date ?? state.date, title: '', venueName: '', address: '' },
                  ])
                }
              >
                {t('addDay')}
              </Button>
            </div>
          )}
        </>
      )}

      {step === 'guests' && (
        <>
          <FieldShell id="event-guests" label={t('guestsLabel')} error={errors.expectedGuests}>
            {(describedBy) => (
              <Input
                id="event-guests"
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.expectedGuests)}
                inputMode="numeric"
                value={state.expectedGuests}
                onChange={(event) => set('expectedGuests', event.target.value.replace(/[^\d]/g, ''))}
              />
            )}
          </FieldShell>
          <FieldShell id="event-budget" label={t('budgetLabel')} hint={t('budgetHint')} error={errors.budgetMinor}>
            {(describedBy) => (
              <MoneyInput
                id="event-budget"
                aria-describedby={describedBy}
                currency={state.currency}
                value={state.budgetMinor}
                onValueChange={(value) => set('budgetMinor', value)}
              />
            )}
          </FieldShell>
          <div>
            <p id="visibility-label" className="mb-2 text-sm font-medium">
              {t('visibilityLabel')}
            </p>
            <RadioGroup
              aria-labelledby="visibility-label"
              value={state.visibility}
              onValueChange={(value) => set('visibility', value as Visibility)}
              className="flex flex-col gap-2"
            >
              {state.visibilities.map((visibility) => (
                <label key={visibility} className="flex min-h-11 cursor-pointer items-center gap-3">
                  <RadioItem value={visibility} aria-label={t(`visibility.${visibility}`)} />
                  <span>{t(`visibility.${visibility}`)}</span>
                </label>
              ))}
            </RadioGroup>
            {errors.visibility && (
              <p role="alert" className="text-danger mt-1 text-sm">
                {errors.visibility}
              </p>
            )}
          </div>
        </>
      )}

      {step === 'features' && (
        <ul className="flex flex-col gap-2">
          {(
            [
              ['invites', t('featureInvites'), t('featureInvitesHelp')],
              ['moments', t('featureMoments'), t('featureMomentsHelp')],
              // Tickets only exist for public events (UF-03-4).
              ...(state.ticketsAllowed && state.visibility === 'PUBLIC'
                ? [['tickets', t('featureTickets'), t('featureTicketsHelp')] as const]
                : []),
            ] as const
          ).map(([key, label, help]) => (
            <li key={key} className="border-border bg-surface flex items-center gap-4 rounded-lg border p-4">
              <div className="flex-1">
                <p id={`feature-${key}`} className="font-medium">
                  {label}
                </p>
                <p className="text-muted text-sm">{help}</p>
              </div>
              <Switch
                aria-labelledby={`feature-${key}`}
                checked={state.features[key]}
                onCheckedChange={(checked) => set('features', { ...state.features, [key]: checked })}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-3">
        {back && back !== 'type' && (
          <Button variant="secondary" onClick={() => router.push(`/events/new?id=${draft.id}&step=${back}`)}>
            {t('back')}
          </Button>
        )}
        <Button type="submit" loading={saving} className="flex-1 sm:flex-none">
          {step === 'features' ? t('create') : t('next')}
        </Button>
      </div>
    </form>
  );
}

function Preview({ draft }: { draft: WizardDraft }) {
  const t = useTranslations('events');
  const first = draft.days[0];
  return (
    <aside aria-label={t('previewHeading')} className="hidden lg:block">
      <Card className="sticky top-24 flex flex-col gap-3 p-4">
        <p className="text-muted text-xs font-medium uppercase tracking-wide">{draft.typeLabel}</p>
        <p className="font-display text-lg font-bold">{draft.name}</p>
        <p className="text-muted flex items-center gap-2 text-sm">
          <CalendarDays aria-hidden className="size-4" />
          {draft.date ? `${draft.date}${draft.startTime ? ` · ${draft.startTime}` : ''}` : t('previewNoDate')}
        </p>
        {first?.venueName && (
          <p className="text-muted flex items-center gap-2 text-sm">
            <MapPin aria-hidden className="size-4" />
            {first.venueName}
          </p>
        )}
        {draft.expectedGuests && (
          <p className="text-muted flex items-center gap-2 text-sm">
            <Users aria-hidden className="size-4" />
            {t('previewGuests', { count: Number(draft.expectedGuests) })}
          </p>
        )}
      </Card>
    </aside>
  );
}
