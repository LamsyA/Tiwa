'use client';

import type { EventFormat, Visibility } from '@tiwa/config/event-types';
import {
  Banner,
  Button,
  DateField,
  FieldShell,
  Input,
  MoneyInput,
  RadioGroup,
  RadioItem,
  Switch,
  ThemeToggle,
  TimeField,
} from '@tiwa/ui';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarDays,
  Camera,
  Check,
  Globe2,
  HeartHandshake,
  Link2,
  Lock,
  Mail,
  MapPin,
  PartyPopper,
  Plus,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
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

const FORMAT_ICON: Record<EventFormat, React.ComponentType<{ className?: string }>> = {
  PRIVATE_CELEBRATION: PartyPopper,
  CORPORATE: Briefcase,
  PUBLIC_TICKETED: Ticket,
  COMMUNITY: HeartHandshake,
};

const VISIBILITY_ICON: Record<Visibility, React.ComponentType<{ className?: string }>> = {
  PRIVATE: Lock,
  LINK_ONLY: Link2,
  PUBLIC: Globe2,
};

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
    <div className="bg-bg text-text relative min-h-dvh">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-56 left-1/2 h-[480px] w-[960px] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
        style={{
          background: 'radial-gradient(closest-side, color-mix(in oklab, var(--brand) 20%, transparent), transparent)',
        }}
      />
      <header className="bg-bg/80 border-border/60 sticky top-0 z-30 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link
            href="/events"
            aria-label={t('wizardClose')}
            className="text-muted hover:text-text hover:bg-surface-2 flex size-10 items-center justify-center rounded-full transition"
          >
            <X aria-hidden className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-muted text-xs font-medium">
              {t('wizardStepOf', { step: index + 1, total: STEPS.length })}
            </p>
            <p className="truncate text-sm font-semibold">{t(`steps.${step}`)}</p>
          </div>
          <ThemeToggle labels={{ light: t('themeLight'), dark: t('themeDark') }} />
        </div>
        <ol aria-label={t('newTitle')} className="mx-auto flex max-w-6xl gap-1.5 px-4 pb-3 sm:px-6">
          {STEPS.map((key, i) => (
            <li key={key} className="flex-1" aria-current={i === index ? 'step' : undefined}>
              <span className="sr-only">{t(`steps.${key}`)}</span>
              <span
                aria-hidden
                className={`block h-1 rounded-full transition-all duration-500 ${i <= index ? 'bg-brand' : 'bg-border'}`}
              />
            </li>
          ))}
        </ol>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pt-8 pb-32 sm:px-6 sm:pt-12">
        {step === 'type' || !draft ? (
          <TypeStep types={types} formats={formats} />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
            <StepForm key={step} step={step} draft={draft} />
            <Preview draft={draft} />
          </div>
        )}
      </main>
    </div>
  );
}

function TypeStep({ types, formats }: { types: TypeCard[]; formats: { key: EventFormat; label: string }[] }) {
  const t = useTranslations('events');
  const router = useRouter();
  const errorText = useErrorText();
  const [query, setQuery] = React.useState('');
  const [format, setFormat] = React.useState<EventFormat | 'all'>('all');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const [custom, setCustom] = React.useState(false);
  const needle = query.trim().toLowerCase();
  const visible = types.filter(
    (type) =>
      (format === 'all' || type.format === format) &&
      (!needle || `${type.label} ${type.blurb}`.toLowerCase().includes(needle)),
  );

  async function start(input: Parameters<typeof startEventDraft>[0], key: string) {
    setBusy(key);
    setError(undefined);
    try {
      const result = await startEventDraft(input);
      if (result.ok) router.push(`/events/new?id=${result.data.eventId}&step=basics`);
      else {
        const errors = errorText(result);
        setError(errors.customLabel ?? errors.form ?? errors.type);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="type-heading" className="tiwa-fade-up flex flex-col gap-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-center">
        <p className="text-brand-strong text-sm font-semibold tracking-wide uppercase">{t('typeEyebrow')}</p>
        <h1
          id="type-heading"
          className="font-display text-3xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-5xl"
        >
          {t('typeHeading')}
        </h1>
        <p className="text-muted text-base sm:text-lg">{t('typeBody')}</p>
        <div className="relative mt-4 w-full">
          <Search
            aria-hidden
            className="text-muted pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2"
          />
          <Input
            type="search"
            aria-label={t('typeSearch')}
            placeholder={t('typeSearch')}
            className="h-14 rounded-2xl pl-12 text-base shadow-[var(--shadow-1)]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t('typeFormats')}
        className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-auto sm:flex-wrap sm:justify-center"
      >
        {[{ key: 'all' as const, label: t('typeAll') }, ...formats].map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={format === option.key}
            onClick={() => setFormat(option.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
              format === option.key
                ? 'bg-text text-bg shadow-[var(--shadow-1)]'
                : 'bg-surface text-muted hover:text-text border-border/70 border'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((type, index) => {
          const Icon = FORMAT_ICON[type.format];
          return (
            <li key={type.key} className="tiwa-fade-up" style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}>
              <button
                type="button"
                disabled={busy !== null}
                aria-busy={busy === type.key || undefined}
                onClick={() => void start({ type: type.key }, type.key)}
                className="group border-border/70 bg-surface hover:border-brand/50 focus-visible:outline-focus flex w-full items-center gap-4 rounded-2xl border p-4 text-left shadow-[var(--shadow-1)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] focus-visible:outline-2 disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className="bg-brand-soft text-brand-strong flex size-11 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105"
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{type.label}</span>
                  <span className="text-muted block truncate text-sm">{type.blurb}</span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="text-muted size-4 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                />
              </button>
            </li>
          );
        })}
        <li className="sm:col-span-2 lg:col-span-3">
          {custom ? (
            <CustomType
              initial={query}
              formats={formats}
              busy={busy === 'custom'}
              onCancel={() => setCustom(false)}
              onCreate={(customLabel, customFormat) =>
                void start({ type: 'custom', customLabel, format: customFormat }, 'custom')
              }
            />
          ) : (
            <button
              type="button"
              onClick={() => setCustom(true)}
              className="group border-border hover:border-brand/60 hover:bg-brand-soft/40 flex w-full items-center gap-4 rounded-2xl border border-dashed p-5 text-left transition"
            >
              <span
                aria-hidden
                className="bg-text text-bg flex size-11 shrink-0 items-center justify-center rounded-xl transition group-hover:rotate-90"
              >
                <Plus className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">
                  {needle && visible.length === 0 ? t('typeEmpty', { query }) : t('customTitle')}
                </span>
                <span className="text-muted block text-sm">{t('customBody')}</span>
              </span>
            </button>
          )}
        </li>
      </ul>
    </section>
  );
}

function CustomType({
  initial,
  formats,
  busy,
  onCancel,
  onCreate,
}: {
  initial: string;
  formats: { key: EventFormat; label: string }[];
  busy: boolean;
  onCancel: () => void;
  onCreate: (label: string, format: EventFormat) => void;
}) {
  const t = useTranslations('events');
  const [label, setLabel] = React.useState(initial.trim());
  const [format, setFormat] = React.useState<EventFormat>('PRIVATE_CELEBRATION');
  return (
    <form
      className="tiwa-pop border-brand/40 bg-surface flex flex-col gap-5 rounded-3xl border p-5 shadow-[var(--shadow-2)] sm:p-7"
      onSubmit={(event) => {
        event.preventDefault();
        if (label.trim().length >= 2) onCreate(label.trim(), format);
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-xl font-bold">{t('customTitle')}</p>
          <p className="text-muted text-sm">{t('customHelp')}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('customCancel')}
          className="text-muted hover:text-text hover:bg-surface-2 flex size-9 items-center justify-center rounded-full"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <FieldShell id="custom-type" label={t('customLabel')}>
        {(describedBy) => (
          <Input
            id="custom-type"
            aria-describedby={describedBy}
            autoFocus
            maxLength={60}
            placeholder={t('customPlaceholder')}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        )}
      </FieldShell>
      <div>
        <p id="custom-format" className="mb-2 text-sm font-medium">
          {t('customFormat')}
        </p>
        <RadioGroup
          aria-labelledby="custom-format"
          value={format}
          onValueChange={(value) => setFormat(value as EventFormat)}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {formats.map((option) => {
            const Icon = FORMAT_ICON[option.key];
            return (
              <label
                key={option.key}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                  format === option.key ? 'border-brand bg-brand-soft/50' : 'border-border/70 hover:bg-surface-2'
                }`}
              >
                <RadioItem value={option.key} aria-label={option.label} />
                <Icon aria-hidden className="text-muted size-4" />
                <span className="text-sm font-medium">{option.label}</span>
              </label>
            );
          })}
        </RadioGroup>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={busy} disabled={label.trim().length < 2}>
          {t('customStart')}
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      </div>
    </form>
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
  const copy: Record<typeof step, [string, string]> = {
    basics: [t('basicsHeading'), t('basicsBody')],
    venue: [t('venueHeading'), t('venueBody')],
    guests: [t('guestsHeading'), t('guestsBody')],
    features: [t('featuresHeading'), t('featuresBody')],
  };

  return (
    <form
      className="tiwa-fade-up flex flex-col gap-6"
      aria-labelledby="step-heading"
      onSubmit={(event) => {
        event.preventDefault();
        void next();
      }}
    >
      <div>
        <p className="text-brand-strong text-sm font-semibold">{draft.typeLabel}</p>
        <h1 id="step-heading" className="font-display mt-1 text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
          {copy[step][0]}
        </h1>
        <p className="text-muted mt-2">{copy[step][1]}</p>
      </div>
      {errors.form && <Banner tone="danger">{errors.form}</Banner>}

      <div className="border-border/70 bg-surface/80 flex flex-col gap-5 rounded-3xl border p-5 shadow-[var(--shadow-1)] backdrop-blur-xl sm:p-7">
        {step === 'basics' && (
          <>
            <FieldShell id="event-name" label={t('nameLabel')} error={errors.name}>
              {(describedBy) => (
                <Input
                  id="event-name"
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(errors.name)}
                  className="h-12 text-base"
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
                <fieldset
                  key={dayIndex}
                  className={`flex flex-col gap-4 ${dayIndex > 0 ? 'border-border/70 border-t pt-5' : ''}`}
                >
                  <legend className="mb-1 flex w-full items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="bg-brand-soft text-brand-strong flex size-7 items-center justify-center rounded-full text-xs font-bold">
                        {n}
                      </span>
                      {t('dayLabel', { n })}
                    </span>
                  </legend>
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
                  <div className="grid gap-4 sm:grid-cols-2">
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
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <Link
                      href="/venues"
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-strong inline-flex items-center gap-1.5 font-medium hover:underline"
                    >
                      <Sparkles aria-hidden className="size-4" />
                      {t('findVenueLink')}
                    </Link>
                    {state.days.length > 1 && (
                      <button
                        type="button"
                        className="text-muted hover:text-danger ml-auto inline-flex items-center gap-1.5"
                        onClick={() =>
                          set(
                            'days',
                            state.days.filter((_, i) => i !== dayIndex),
                          )
                        }
                      >
                        <Trash2 aria-hidden className="size-4" />
                        {t('removeDay', { n })}
                      </button>
                    )}
                  </div>
                </fieldset>
              );
            })}
            {state.days.length < 14 && (
              <button
                type="button"
                className="border-border text-muted hover:text-text hover:border-brand/60 flex items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm font-medium transition"
                onClick={() =>
                  set('days', [
                    ...state.days,
                    { date: state.days.at(-1)?.date ?? state.date, title: '', venueName: '', address: '' },
                  ])
                }
              >
                <Plus aria-hidden className="size-4" />
                {t('addDay')}
              </button>
            )}
          </>
        )}

        {step === 'guests' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell id="event-guests" label={t('guestsLabel')} error={errors.expectedGuests}>
                {(describedBy) => (
                  <Input
                    id="event-guests"
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(errors.expectedGuests)}
                    inputMode="numeric"
                    placeholder="100"
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
            </div>
            <div>
              <p id="visibility-label" className="mb-3 text-sm font-medium">
                {t('visibilityLabel')}
              </p>
              <RadioGroup
                aria-labelledby="visibility-label"
                value={state.visibility}
                onValueChange={(value) => set('visibility', value as Visibility)}
                className="grid gap-2"
              >
                {state.visibilities.map((visibility) => {
                  const Icon = VISIBILITY_ICON[visibility];
                  const selected = state.visibility === visibility;
                  return (
                    <label
                      key={visibility}
                      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 ${
                        selected ? 'border-brand bg-brand-soft/50' : 'border-border/70 hover:bg-surface-2'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex size-9 items-center justify-center rounded-xl ${
                          selected ? 'bg-brand text-on-brand' : 'bg-surface-2 text-muted'
                        }`}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="flex-1 text-sm">{t(`visibility.${visibility}`)}</span>
                      <span className="shrink-0">
                        <RadioItem value={visibility} aria-label={t(`visibility.${visibility}`)} />
                      </span>
                    </label>
                  );
                })}
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
          <ul className="flex flex-col gap-3">
            {(
              [
                ['invites', t('featureInvites'), t('featureInvitesHelp'), Mail],
                ['moments', t('featureMoments'), t('featureMomentsHelp'), Camera],
                // Tickets only exist for public events (UF-03-4).
                ...(state.ticketsAllowed && state.visibility === 'PUBLIC'
                  ? [['tickets', t('featureTickets'), t('featureTicketsHelp'), Ticket] as const]
                  : []),
              ] as const
            ).map(([key, label, help, Icon]) => (
              <li
                key={key}
                className={`flex items-center gap-4 rounded-2xl border p-4 transition ${
                  state.features[key] ? 'border-brand/50 bg-brand-soft/40' : 'border-border/70'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
                    state.features[key] ? 'bg-brand text-on-brand' : 'bg-surface-2 text-muted'
                  }`}
                >
                  <Icon className="size-5" />
                </span>
                <div className="flex-1">
                  <p id={`feature-${key}`} className="font-semibold">
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
      </div>

      <div className="bg-bg/85 border-border/60 sticky bottom-0 z-30 -mx-4 border-t backdrop-blur-xl sm:-mx-6 lg:mx-0 lg:rounded-2xl lg:border">
        <div
          className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {back && back !== 'type' && (
            <Button
              variant="ghost"
              onClick={() => router.push(`/events/new?id=${draft.id}&step=${back}`)}
              className="gap-1.5"
            >
              <ArrowLeft aria-hidden className="size-4" />
              {t('back')}
            </Button>
          )}
          <Button type="submit" size="lg" loading={saving} className="ml-auto min-w-40">
            {step === 'features' ? t('create') : t('next')}
            {step === 'features' ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <ArrowRight aria-hidden className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Preview({ draft }: { draft: WizardDraft }) {
  const t = useTranslations('events');
  const first = draft.days[0];
  return (
    <aside aria-label={t('previewHeading')} className="hidden lg:block">
      <div className="sticky top-32">
        <p className="text-muted mb-3 text-xs font-semibold tracking-wide uppercase">{t('previewHeading')}</p>
        <div className="border-border/70 bg-surface overflow-hidden rounded-3xl border shadow-[var(--shadow-2)]">
          <div
            className="relative h-36"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in oklab, var(--brand) 85%, black 5%), color-mix(in oklab, var(--accent) 70%, var(--brand)))',
            }}
          >
            <div className="tiwa-grid-bg absolute inset-0 opacity-30" />
            <span className="absolute bottom-3 left-4 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
              {draft.typeLabel}
            </span>
          </div>
          <div className="flex flex-col gap-3 p-5">
            <p className="font-display text-xl leading-tight font-bold">{draft.name}</p>
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
          </div>
        </div>
      </div>
    </aside>
  );
}
