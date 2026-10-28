'use client';

import * as React from 'react';

function fractionDigits(currency: string, locale: string): number {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
function minorToMajor(minor: string | bigint, digits: number): string {
  const raw = typeof minor === 'bigint' ? minor.toString() : minor;
  if (digits === 0) return raw === '' ? '0' : raw;
  const padded = raw.padStart(digits + 1, '0');
  const whole = padded.slice(0, -digits) || '0';
  const frac = padded.slice(-digits);
  return `${whole}.${frac}`;
}

export interface MoneyTextProps {
  /** Minor units (kobo, cents) as bigint or numeric string. Never floats. */
  value: bigint | string;
  currency: string;
  locale?: string;
  className?: string;
}

/** Money formatted with Intl for the event locale/currency. */
export function MoneyText({ value, currency, locale = 'en', className }: MoneyTextProps) {
  const text = React.useMemo(() => {
    const digits = fractionDigits(currency, locale);
    const amount = Number(minorToMajor(value, digits));
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
    } catch {
      return `${currency} ${minorToMajor(value, digits)}`;
    }
  }, [value, currency, locale]);
  return <span className={className}>{text}</span>;
}

export type DateTextFormat = 'date' | 'datetime' | 'time';

export interface DateTextProps {
  value: Date | string | number;
  format?: DateTextFormat;
  locale?: string;
  timeZone?: string;
  className?: string;
}

/** Dates formatted with Intl for the event locale/timezone. */
export function DateText({ value, format = 'date', locale = 'en', timeZone = 'UTC', className }: DateTextProps) {
  const text = React.useMemo(() => {
    const date = value instanceof Date ? value : new Date(value);
    const styles: Record<DateTextFormat, Intl.DateTimeFormatOptions> = {
      date: { dateStyle: 'medium' },
      datetime: { dateStyle: 'medium', timeStyle: 'short' },
      time: { timeStyle: 'short' },
    };
    try {
      return new Intl.DateTimeFormat(locale, { ...styles[format], timeZone }).format(date);
    } catch {
      return date.toISOString();
    }
  }, [value, format, locale, timeZone]);
  return (
    <time dateTime={(value instanceof Date ? value : new Date(value)).toISOString()} className={className}>
      {text}
    </time>
  );
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_104_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

export interface RelativeTimeProps {
  value: Date | string | number;
  locale?: string;
  /** Reference instant (defaults to now). Inject for tests/stories. */
  now?: Date | string | number;
  className?: string;
}

/** "3 days ago" / "tomorrow" via Intl.RelativeTimeFormat (numeric: auto). */
export function RelativeTime({ value, locale = 'en', now, className }: RelativeTimeProps) {
  const text = React.useMemo(() => {
    const date = (value instanceof Date ? value : new Date(value)).getTime();
    const reference = now === undefined ? Date.now() : (now instanceof Date ? now : new Date(now)).getTime();
    const seconds = Math.round((date - reference) / 1000);
    const absolute = Math.abs(seconds);
    const [unit, size] = UNITS.find(([, unitSeconds]) => absolute >= unitSeconds) ?? ['second', 1];
    const amount = Math.round(seconds / (size as number));
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit as Intl.RelativeTimeFormatUnit);
  }, [value, locale, now]);
  const iso = (value instanceof Date ? value : new Date(value)).toISOString();
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
