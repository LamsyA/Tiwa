'use client';

import { AsYouType } from 'libphonenumber-js';
import type { CountryCode } from 'libphonenumber-js';
import * as React from 'react';
import { currencyForCountry, currencySymbol } from '@tiwa/config/locale.js';
import { Input } from './input.js';

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
 */
export function PhoneInput({ value, onValueChange, defaultCountry = 'NG', ...rest }: PhoneInputProps) {
  const [country, setCountry] = React.useState<CountryCode>(defaultCountry);
  const [text, setText] = React.useState(() => (value ? new AsYouType(country).input(value) : ''));

  const lastValue = React.useRef(value);
  if (value !== lastValue.current) {
    lastValue.current = value;
    setText(value ? new AsYouType(country).input(value) : '');
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const typer = new AsYouType(country);
    const formatted = typer.input(raw);
    const detected = typer.getCountry();
    if (detected && detected !== country) setCountry(detected);
    const number = typer.getNumber();
    setText(formatted);
    onValueChange(number ? number.number : '', number ? number.isValid() : false);
  }

  return <Input {...rest} value={text} onChange={handleChange} inputMode="tel" autoComplete="tel" type="tel" />;
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
