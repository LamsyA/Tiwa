'use client';

import * as React from 'react';
import { cn } from '@tiwa/ui';

const CODE_LENGTH = 6;

/**
 * 6-box OTP input: auto-advances, distributes pasted codes, backspace
 * navigates back, auto-submits when complete (UF-01-2).
 */
export function OtpInput({
  id = 'otp',
  label,
  value,
  onChange,
  onComplete,
  disabled = false,
  error,
}: {
  id?: string | undefined;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: ((value: string) => void) | undefined;
  disabled?: boolean | undefined;
  error?: string | undefined;
}) {
  const boxes = React.useRef<Array<HTMLInputElement | null>>([]);
  const completedFor = React.useRef('');

  function setFromString(raw: string, focusIndex?: number) {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    onChange(digits);
    if (focusIndex !== undefined) boxes.current[focusIndex]?.focus();
    else if (digits.length === CODE_LENGTH) boxes.current[CODE_LENGTH - 1]?.focus();
    if (digits.length === CODE_LENGTH && digits !== completedFor.current) {
      completedFor.current = digits;
      onComplete?.(digits);
    }
    if (digits.length < CODE_LENGTH) completedFor.current = '';
  }

  return (
    <div>
      <label id={`${id}-label`} className="mb-1 block text-sm font-medium text-text">
        {label}
      </label>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="flex gap-2"
        onPaste={(event) => {
          const text = event.clipboardData.getData('text');
          if (text) {
            event.preventDefault();
            setFromString(text);
          }
        }}
      >
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <input
            key={index}
            ref={(element) => {
              boxes.current[index] = element;
            }}
            value={value[index] ?? ''}
            onChange={(event) => {
              const digit = event.target.value.replace(/\D/g, '').slice(-1);
              const next = (value.slice(0, index) + digit + value.slice(index + 1)).slice(0, CODE_LENGTH);
              onChange(next);
              if (digit && index < CODE_LENGTH - 1) boxes.current[index + 1]?.focus();
              if (next.length === CODE_LENGTH && next !== completedFor.current) {
                completedFor.current = next;
                onComplete?.(next);
              }
              if (next.length < CODE_LENGTH) completedFor.current = '';
            }}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !value[index] && index > 0) {
                event.preventDefault();
                const next = value.slice(0, index - 1) + value.slice(index);
                onChange(next);
                boxes.current[index - 1]?.focus();
              }
            }}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            disabled={disabled}
            aria-label={`${label} digit ${index + 1}`}
            aria-invalid={error ? true : undefined}
            className={cn(
              'border-border bg-bg text-text h-12 w-full rounded-md border text-center text-lg font-medium',
              'focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-danger focus:border-danger focus:ring-danger',
            )}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-danger mt-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
