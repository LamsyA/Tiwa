import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  href?: string;
  /** Accessible name for the stretched link/button (required when children aren't plain text). */
  linkLabel?: string;
  onNavigate?: () => void;
}

/**
 * Card. Whole card clickable via stretched link when `href`/`onNavigate`
 * is given (real link or button, never a div handler).
 */
export function Card({ interactive = false, href, linkLabel, onNavigate, className, children, ...rest }: CardProps) {
  const stretchedLabel = linkLabel ?? (typeof children === 'string' ? children : undefined);
  // D-X72: one box. Page classes (padding, flex, gap…) apply to the content
  // directly — before, they landed on an outer wrapper around a padded inner
  // div, doubling padding and leaving layout classes without effect.
  const ownPadding = /(^|\s)(?:[a-z]+:)?p[xytrbl]?-/.test(className ?? '');
  return (
    <div
      className={cn(
        'border-border/70 bg-surface relative rounded-2xl border shadow-[var(--shadow-1)]',
        !ownPadding && 'p-4 sm:p-5',
        interactive &&
          'hover:border-text/15 transition-all duration-fast ease-out hover:-translate-y-0.5 hover:shadow-2 active:scale-[0.99]',
        className,
      )}
      {...rest}
    >
      {href ? (
        <a href={href} aria-label={stretchedLabel} className="absolute inset-0 z-0 rounded-2xl" />
      ) : onNavigate ? (
        <button
          type="button"
          onClick={onNavigate}
          aria-label={stretchedLabel ?? 'Open'}
          className="absolute inset-0 z-0 rounded-2xl"
        />
      ) : null}
      {children}
    </div>
  );
}

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  delta?: { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' };
  help?: string;
  className?: string;
  /** D-X70: optional leading icon and colour accent. */
  icon?: React.ReactNode;
  tone?: 'brand' | 'teal' | 'accent' | 'neutral';
}

const toneClasses = {
  brand: 'bg-brand-soft text-brand-strong',
  teal: 'bg-teal-soft text-teal-strong',
  accent: 'bg-accent/15 text-[#8a6500] dark:text-accent',
  neutral: 'bg-surface-2 text-muted',
};

const deltaTones = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted',
};

/** Label + big display number + optional delta and help text. */
export function StatCard({ label, value, delta, help, className, icon, tone = 'neutral' }: StatCardProps) {
  const helpId = help ? React.useId() : undefined;
  return (
    <div
      className={cn(
        'border-border/70 bg-surface group/stat relative min-w-0 overflow-hidden rounded-2xl border p-3 shadow-[var(--shadow-1)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] sm:p-4',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <span
            aria-hidden
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg [&>svg]:size-3.5',
              toneClasses[tone],
            )}
          >
            {icon}
          </span>
        )}
        <p className="text-muted min-w-0 truncate text-[11px] font-semibold tracking-[0.08em] uppercase">{label}</p>
      </div>
      <p
        className="font-display mt-1.5 truncate text-lg leading-none font-bold tracking-tight sm:text-2xl"
        aria-describedby={helpId}
      >
        {value}
      </p>
      {delta && <p className={cn('mt-1 truncate text-xs', deltaTones[delta.tone])}>{delta.text}</p>}
      {help && (
        <p id={helpId} className="text-muted mt-1 truncate text-xs">
          {help}
        </p>
      )}
    </div>
  );
}
