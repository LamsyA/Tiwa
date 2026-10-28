import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface FieldShellProps {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: (describedBy: string | undefined) => React.ReactNode;
  className?: string;
}

/** Label always above, hint/error text below with `aria-describedby` wiring. */
export function FieldShell({ id, label, hint, error, children, className }: FieldShellProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-text">
        {label}
      </label>
      {children(describedBy)}
      {hint && !error && (
        <p id={hintId} className="text-muted mt-1 text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-danger mt-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  'w-full rounded-md border border-border bg-bg text-text placeholder:text-muted focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: 'sm' | 'md';
  error?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', error = false, prefix, suffix, className, id, ...rest },
  ref,
) {
  const field = (
    <input
      ref={ref}
      id={id}
      aria-invalid={error || undefined}
      className={cn(
        inputBase,
        size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-3 text-base',
        error && 'border-danger focus:border-danger focus:ring-danger',
        prefix && 'pl-9',
        suffix && 'pr-9',
        className,
      )}
      {...rest}
    />
  );
  if (!prefix && !suffix) return field;
  return (
    <div className="relative">
      {prefix && (
        <span aria-hidden className="text-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          {prefix}
        </span>
      )}
      {field}
      {suffix && (
        <span aria-hidden className="text-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {suffix}
        </span>
      )}
    </div>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error = false, className, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={error || undefined}
      className={cn(
        inputBase,
        'min-h-11 px-3 py-2 text-base',
        error && 'border-danger focus:border-danger focus:ring-danger',
        className,
      )}
      {...rest}
    />
  );
});
