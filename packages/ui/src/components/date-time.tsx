import * as React from 'react';
import { Input } from './input.js';

export interface DateFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'size'
> {
  /** `YYYY-MM-DD`. Empty string when blank. */
  value: string;
  onValueChange: (isoDate: string) => void;
  size?: 'sm' | 'md';
  error?: boolean;
}

/**
 * Date field. Native picker everywhere: the OS sheet on mobile, the
 * browser calendar popup on desktop Chrome/Edge (acceptable fallback
 * elsewhere). A custom popover calendar can replace this in P3 if needed.
 */
export function DateField({ value, onValueChange, ...rest }: DateFieldProps) {
  return <Input {...rest} type="date" value={value} onChange={(event) => onValueChange(event.target.value)} />;
}

export interface TimeFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'size'
> {
  /** `HH:MM` (24-hour). Empty string when blank. */
  value: string;
  onValueChange: (time: string) => void;
  size?: 'sm' | 'md';
  error?: boolean;
}

/** Time field. Native picker (scroll wheels on mobile, dropdown on desktop). */
export function TimeField({ value, onValueChange, ...rest }: TimeFieldProps) {
  return <Input {...rest} type="time" value={value} onChange={(event) => onValueChange(event.target.value)} />;
}

export interface DateRange {
  start: string;
  end: string;
}

export function DateRangeField({
  value,
  onValueChange,
  ...rest
}: Omit<DateFieldProps, 'value' | 'onValueChange'> & {
  value: DateRange;
  onValueChange: (range: DateRange) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <DateField
        {...rest}
        aria-label={`${rest['aria-label'] ?? 'Date'} start`}
        value={value.start}
        onValueChange={(start) => onValueChange({ ...value, start })}
      />
      <span aria-hidden className="text-muted">
        →
      </span>
      <DateField
        {...rest}
        aria-label={`${rest['aria-label'] ?? 'Date'} end`}
        value={value.end}
        min={value.start || undefined}
        onValueChange={(end) => onValueChange({ ...value, end })}
      />
    </div>
  );
}
