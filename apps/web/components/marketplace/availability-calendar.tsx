'use client';

import { cn } from '@tiwa/ui';
import { CalendarCheck, CalendarX, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export interface AvailabilityRow {
  date: string;
  spaceId: string | null;
  slot: string;
}

const MONTHS_AHEAD = 6;

function monthKey(date: string) {
  return date.slice(0, 7);
}

function shiftMonth(key: string, by: number) {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function grid(key: string) {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(`${key}-${String(day).padStart(2, '0')}`);
  return cells;
}

/** Whole day taken: an org-wide full-day block, or every space of a venue taken all day. */
export function dayStatus(rows: AvailabilityRow[], date: string, spaces: number): 'free' | 'partial' | 'booked' {
  const today = rows.filter((row) => row.date === date);
  if (today.length === 0) return 'free';
  if (today.some((row) => row.spaceId === null && row.slot === 'FULL_DAY')) return 'booked';
  if (spaces > 0) {
    const fullSpaces = new Set(today.filter((row) => row.slot === 'FULL_DAY' && row.spaceId).map((row) => row.spaceId));
    if (fullSpaces.size >= spaces) return 'booked';
  } else if (today.some((row) => row.slot === 'FULL_DAY')) {
    return 'booked';
  }
  return 'partial';
}

/**
 * Vendor availability (D-X43): six months, booked days struck through, part-
 * booked days dotted, and the viewer's event date highlighted with a plain
 * "free" or "booked" answer. Bookings fill it automatically.
 */
export function AvailabilityCalendar({
  rows,
  spaces = 0,
  eventDate,
  eventName,
  confirmedAt,
}: {
  rows: AvailabilityRow[];
  spaces?: number;
  /** YYYY-MM-DD of the viewer's event, if they came from one. */
  eventDate?: string | null;
  eventName?: string | null;
  confirmedAt?: string | null;
}) {
  const t = useTranslations('marketplace.calendar');
  const todayKey = new Date().toISOString().slice(0, 10);
  const first = monthKey(todayKey);
  const last = shiftMonth(first, MONTHS_AHEAD - 1);
  const start = eventDate && monthKey(eventDate) >= first && monthKey(eventDate) <= last ? monthKey(eventDate) : first;
  const [month, setMonth] = React.useState(start);
  const cells = grid(month);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const label = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
  const yours = eventDate ? dayStatus(rows, eventDate, spaces) : null;
  const pretty = (date: string) =>
    new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00Z`),
    );

  return (
    <div className="flex flex-col gap-4">
      {eventDate && yours && (
        <div
          className={cn(
            'flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm',
            yours === 'booked' ? 'border-danger/40 bg-danger/5' : 'border-success/40 bg-success/5',
          )}
        >
          {yours === 'booked' ? (
            <CalendarX className="text-danger mt-0.5 size-5 shrink-0" aria-hidden />
          ) : (
            <CalendarCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
          )}
          <div>
            <p className="font-semibold">
              {yours === 'booked'
                ? t('bookedOnYours', { date: pretty(eventDate) })
                : yours === 'partial'
                  ? t('partOnYours', { date: pretty(eventDate) })
                  : t('freeOnYours', { date: pretty(eventDate) })}
            </p>
            <p className="text-muted text-xs">
              {yours === 'booked' ? t('bookedHint') : t('freeHint', { event: eventName ?? '' })}
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={t('previous')}
          disabled={month <= first}
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="hover:bg-surface-2 rounded-full p-2 transition disabled:opacity-30"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <p className="font-semibold" aria-live="polite">
          {label}
        </p>
        <button
          type="button"
          aria-label={t('next')}
          disabled={month >= last}
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="hover:bg-surface-2 rounded-full p-2 transition disabled:opacity-30"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div className="text-muted grid grid-cols-7 text-center text-[11px] font-semibold tracking-wide uppercase">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1 text-center text-sm" aria-label={t('label', { month: label })}>
        {cells.map((date, i) => {
          if (!date) return <li key={`pad-${i}`} />;
          const status = dayStatus(rows, date, spaces);
          const past = date < todayKey;
          const mine = date === eventDate;
          return (
            <li
              key={date}
              aria-label={`${pretty(date)}: ${t(`status.${status}`)}${mine ? ` · ${t('yourDate')}` : ''}`}
              className={cn(
                'relative grid aspect-square place-items-center rounded-xl text-sm tabular-nums transition',
                past && 'text-muted/50',
                !past && status === 'booked' && 'bg-danger/10 text-danger line-through',
                !past && status === 'free' && 'hover:bg-surface-2',
                date === todayKey && 'font-bold',
                mine && 'ring-brand bg-brand/10 text-brand-strong font-bold ring-2',
              )}
            >
              {Number(date.slice(8))}
              {!past && status === 'partial' && (
                <span aria-hidden className="bg-warning absolute bottom-1 size-1 rounded-full" />
              )}
            </li>
          );
        })}
      </ol>
      <div className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="border-border size-3 rounded border" aria-hidden />
          {t('status.free')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-warning size-2 rounded-full" aria-hidden />
          {t('status.partial')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-danger/30 size-3 rounded" aria-hidden />
          {t('status.booked')}
        </span>
        {eventDate && (
          <span className="inline-flex items-center gap-1.5">
            <span className="ring-brand size-3 rounded ring-2" aria-hidden />
            {t('yourDate')}
          </span>
        )}
      </div>
      <p className="text-muted text-xs">{confirmedAt ? t('confirmed', { date: confirmedAt }) : t('autoNote')}</p>
    </div>
  );
}
