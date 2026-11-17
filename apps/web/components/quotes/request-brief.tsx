import { MoneyText } from '@tiwa/ui';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  MessageSquareText,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type * as React from 'react';
import { KIND_CHECKS, KIND_STYLE, requestKind } from './request-kind.js';

export interface BriefFields {
  eventName?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string;
  venue?: string | null;
  expectedGuests?: number | null;
  notes?: string;
  budgetMaxMinor?: string;
}

/**
 * The client's request, laid out for the kind of service (D-X80): a venue sees
 * a booking request with hours and capacity, a caterer a food order with
 * portions and serving time, a photographer a coverage request, and so on.
 */
export async function RequestBrief({
  category,
  categoryLabel,
  brief,
  currency,
}: {
  category: string;
  categoryLabel: string;
  brief: BriefFields;
  currency: string;
}) {
  const t = await getTranslations('quotes.kind');
  const kind = requestKind(category);
  const style = KIND_STYLE[kind];
  const KindIcon = style.icon;
  const tz = brief.timezone ?? 'UTC';
  const start = brief.startsAt ? new Date(brief.startsAt) : null;
  const end = brief.endsAt ? new Date(brief.endsAt) : null;
  const day = start
    ? new Intl.DateTimeFormat('en', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: tz,
      }).format(start)
    : t('noDate');
  const time = (date: Date) =>
    new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(date);
  const window = start ? (end ? `${time(start)} – ${time(end)}` : t('from', { time: time(start) })) : t('noTime');
  const guests = typeof brief.expectedGuests === 'number' ? brief.expectedGuests : null;
  const place = brief.venue || t('noVenue');

  const facts: { icon: LucideIcon; label: string; value: React.ReactNode }[] = (() => {
    switch (kind) {
      case 'venue':
        return [
          { icon: CalendarDays, label: t('fact.date'), value: day },
          { icon: Clock, label: t('fact.hours'), value: window },
          { icon: Users, label: t('fact.capacity'), value: guests !== null ? t('people', { count: guests }) : '—' },
          { icon: MapPin, label: t('fact.currentVenue'), value: brief.venue || t('noVenueYet') },
        ];
      case 'coverage':
        return [
          { icon: CalendarDays, label: t('fact.date'), value: day },
          { icon: Clock, label: t('fact.coverage'), value: window },
          { icon: MapPin, label: t('fact.location'), value: place },
          { icon: Users, label: t('fact.guests'), value: guests ?? '—' },
        ];
      case 'food':
        return [
          { icon: Users, label: t('fact.portions'), value: guests !== null ? t('portions', { count: guests }) : '—' },
          { icon: CalendarDays, label: t('fact.servingDay'), value: day },
          { icon: Clock, label: t('fact.servingTime'), value: start ? time(start) : t('noTime') },
          { icon: MapPin, label: t('fact.deliverTo'), value: place },
        ];
      case 'performance':
        return [
          { icon: CalendarDays, label: t('fact.date'), value: day },
          { icon: Clock, label: t('fact.setTime'), value: window },
          { icon: MapPin, label: t('fact.venue'), value: place },
          { icon: Users, label: t('fact.crowd'), value: guests ?? '—' },
        ];
      default:
        return [
          { icon: CalendarDays, label: t('fact.date'), value: day },
          { icon: Clock, label: t('fact.startTime'), value: start ? time(start) : t('noTime') },
          { icon: MapPin, label: t('fact.venue'), value: place },
          { icon: Users, label: t('fact.guests'), value: guests ?? '—' },
        ];
    }
  })();
  if (brief.budgetMaxMinor && brief.budgetMaxMinor !== '0') {
    facts.push({
      icon: Wallet,
      label: t('fact.budget'),
      value: <MoneyText value={brief.budgetMaxMinor} currency={currency} />,
    });
  }
  const checks = KIND_CHECKS[kind];

  return (
    <section
      aria-label={t(`title.${kind}`)}
      className="border-border/70 bg-surface relative overflow-hidden rounded-3xl border shadow-[var(--shadow-1)]"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${style.bar}`} />
      <div className={`flex items-center gap-3 bg-gradient-to-r ${style.wash} to-transparent px-4 py-4 sm:px-6`}>
        <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${style.chip}`}>
          <KindIcon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">{categoryLabel}</p>
          <h2 className="font-display truncate text-lg font-bold tracking-tight sm:text-xl">{t(`title.${kind}`)}</h2>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-1 pb-5 sm:px-6">
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {facts.map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-surface-2/70 flex min-w-0 flex-col gap-1 rounded-2xl p-3">
              <dt className="text-muted flex items-center gap-1.5 text-[11px] font-medium">
                <Icon aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </dt>
              <dd className="text-sm leading-snug font-semibold break-words">{value}</dd>
            </div>
          ))}
        </dl>

        {brief.notes && (
          <div className="flex gap-3 rounded-2xl border border-dashed p-3.5 text-sm">
            <MessageSquareText aria-hidden className="text-muted mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-muted mb-0.5 text-[11px] font-semibold tracking-wide uppercase">{t('notes')}</p>
              <p className="whitespace-pre-line">{brief.notes}</p>
            </div>
          </div>
        )}

        {checks.length > 0 && (
          <div>
            <p className="text-muted mb-2 text-[11px] font-semibold tracking-[0.14em] uppercase">{t('checksTitle')}</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {checks.map((key) => (
                <li key={key} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 aria-hidden className="text-success mt-0.5 size-4 shrink-0" />
                  <span>{t(`check.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
