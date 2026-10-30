'use client';

import type { CountryCode } from 'libphonenumber-js';
import * as React from 'react';
import { currencyForCountry, currencySymbol } from '@tiwa/config/locale.js';
import { Input } from './input.js';

type AsYouTypeCtor = typeof import('libphonenumber-js').AsYouType;

let cachedCtor: AsYouTypeCtor | undefined;
let ctorPromise: Promise<AsYouTypeCtor> | undefined;

/**
 * libphonenumber-js carries metadata for every country (~80 KB gzip). It is
 * only needed while someone edits a phone field, so it loads on demand
 * instead of shipping in the shared bundle every page downloads (P3-T13).
 */
function loadAsYouType(): Promise<AsYouTypeCtor> {
  ctorPromise ??= import('libphonenumber-js').then((module) => {
    cachedCtor = module.AsYouType;
    return cachedCtor;
  });
  return ctorPromise;
}

export interface PhoneInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'size'
> {
  /** E.164 value, e.g. "+2348012345678". Empty string when blank/invalid. */
  value: string;
  onValueChange: (e164: string, isValid: boolean) => void;
  defaultCountry?: CountryCode;
  size?: 'sm' | 'md';
  error?: boolean;
}

/**
 * Phone input: formats as you type (`AsYouType`), stores E.164.
 * Country starts at `defaultCountry` and follows a typed `+` prefix.
 * Until the formatter chunk arrives the raw value shows; it is reformatted
 * (and re-emitted) as soon as the library lands.
 */
export function PhoneInput({ value, onValueChange, defaultCountry = 'NG', ...rest }: PhoneInputProps) {
  const [country, setCountry] = React.useState<CountryCode>(defaultCountry);
  const [Ctor, setCtor] = React.useState<AsYouTypeCtor | undefined>(() => cachedCtor);
  const [text, setText] = React.useState(() => (value ? formatRaw(Ctor, value, defaultCountry).text : ''));

  React.useEffect(() => {
    if (Ctor) return;
    let alive = true;
    void loadAsYouType().then((loaded) => {
      if (alive) setCtor(() => loaded);
    });
    return () => {
      alive = false;
    };
  }, [Ctor]);

  const lastValue = React.useRef(value);
  if (value !== lastValue.current) {
    lastValue.current = value;
    setText(value ? formatRaw(Ctor, value, country).text : '');
  }

  // Formatter arrived after mount: normalise whatever is currently shown.
  const normalisedFor = React.useRef<AsYouTypeCtor | undefined>(undefined);
  React.useEffect(() => {
    if (!Ctor || normalisedFor.current === Ctor) return;
    normalisedFor.current = Ctor;
    if (!text) return;
    const result = formatRaw(Ctor, text, country);
    setText(result.text);
    if (result.country && result.country !== country) setCountry(result.country);
    onValueChange(result.e164, result.valid);
    // Only on formatter arrival; text/country changes go through handleChange.
  }, [Ctor]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const result = formatRaw(Ctor, raw, country);
    if (result.country && result.country !== country) setCountry(result.country);
    setText(result.text);
    onValueChange(result.e164, result.valid);
  }

  return <Input {...rest} value={text} onChange={handleChange} inputMode="tel" autoComplete="tel" type="tel" />;
}

function formatRaw(
  Ctor: AsYouTypeCtor | undefined,
  raw: string,
  country: CountryCode,
): { text: string; e164: string; valid: boolean; country: CountryCode | undefined } {
  if (!Ctor) return { text: raw, e164: '', valid: false, country: undefined };
  const typer = new Ctor(country);
  const text = typer.input(raw);
  const number = typer.getNumber();
  return {
    text,
    e164: number ? number.number : '',
    valid: number ? number.isValid() : false,
    country: typer.getCountry(),
  };
}

export interface MoneyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'size' | 'prefix'
> {
  /** Minor-units string, e.g. "2500000" kobo. Empty string when blank. */
  value: string;
  onValueChange: (minorUnits: string) => void;
  currency?: string;
  size?: 'sm' | 'md';
  error?: boolean;
}

function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** "2500000" kobo → "25000" naira (string decimal placement, no float). */
function minorToMajor(minor: string, digits: number): string {
  const padded = minor.padStart(digits + 1, '0');
  const whole = padded.slice(0, -digits) || '0';
  const frac = digits === 0 ? '' : padded.slice(-digits).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

function majorToMinor(raw: string, digits: number): string | undefined {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return '';
  const [whole = '0', ...restParts] = cleaned.split('.');
  if (!/^\d*$/.test(whole)) return undefined;
  const frac = (restParts.join('').replace(/\D/g, '') + '0'.repeat(digits)).slice(0, digits);
  try {
    const minor = BigInt(whole === '' ? '0' : whole) * 10n ** BigInt(digits) + BigInt(frac === '' ? '0' : frac);
    return minor.toString();
  } catch {
    return undefined;
  }
}

/**
 * Money input: shows the Intl narrow symbol, edits in major units,
 * stores minor units as a string (→ BigInt on the server).
 */
export function MoneyInput({ value, onValueChange, currency, size, error, ...rest }: MoneyInputProps) {
  const resolvedCurrency = currency ?? currencyForCountry();
  const digits = minorDigits(resolvedCurrency);
  const symbol = currencySymbol(resolvedCurrency);
  const [text, setText] = React.useState(() => (value === '' ? '' : minorToMajor(value, digits)));

  const lastValue = React.useRef(value);
  if (value !== lastValue.current) {
    lastValue.current = value;
    setText(value === '' ? '' : minorToMajor(value, digits));
  }

  return (
    <Input
      {...rest}
      size={size}
      error={error}
      inputMode="decimal"
      autoComplete="off"
      prefix={<span aria-hidden>{symbol}</span>}
      value={text}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        const minor = majorToMinor(raw, digits);
        if (minor !== undefined) onValueChange(minor);
      }}
      onBlur={(event) => {
        if (value !== '') setText(minorToMajor(value, digits));
        rest.onBlur?.(event);
      }}
    />
  );
}
