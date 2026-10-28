import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}

/** Selectable chip; with `onRemove` it also gets a remove button. */
export function Chip({ selected = false, onRemove, removeLabel = 'Remove', className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
        selected ? 'border-brand-strong bg-brand-soft text-text' : 'border-border bg-surface text-muted',
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        className="focus-visible:outline-2 focus-visible:outline-focus -m-1 rounded-full p-1 focus-visible:outline-offset-2"
        {...rest}
      >
        {children}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="text-muted hover:text-text -m-1 rounded-full p-1 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </span>
  );
}

export function ChipGroup({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {children}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const badgeTones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-text',
  brand: 'bg-brand-soft text-text',
  success: 'bg-success-soft text-text',
  warning: 'bg-warning-soft text-text',
  danger: 'bg-danger-soft text-text',
};

/** Small count/label badge. Always paired with visible text nearby. */
export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-medium',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const dotTones: Record<Tone, string> = {
  neutral: 'bg-muted',
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/** Status with a coloured dot AND text — never colour alone. */
export function StatusPill({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm',
        className,
      )}
    >
      <span aria-hidden className={cn('size-2 rounded-full', dotTones[tone])} />
      {children}
    </span>
  );
}
