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
  return (
    <div
      className={cn(
        'border-border/80 bg-bg rounded-2xl border shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.08)]',
        interactive &&
          'hover:border-text/15 transition-all duration-fast ease-out hover:-translate-y-0.5 hover:shadow-2 active:scale-[0.99]',
        className,
      )}
      {...rest}
    >
      <div className="relative p-5">
        {href ? (
          <a href={href} aria-label={stretchedLabel} className="after:absolute after:inset-0 after:rounded-2xl" />
        ) : onNavigate ? (
          <button
            type="button"
            onClick={onNavigate}
            aria-label={stretchedLabel ?? 'Open'}
            className="after:absolute after:inset-0 after:rounded-2xl"
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  delta?: { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' };
  help?: string;
  className?: string;
}

const deltaTones = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted',
};

/** Label + big display number + optional delta and help text. */
export function StatCard({ label, value, delta, help, className }: StatCardProps) {
  const helpId = help ? React.useId() : undefined;
  return (
    <div
      className={cn(
        'border-border/80 bg-bg rounded-2xl border p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.08)]',
        className,
      )}
    >
      <p className="text-muted text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="font-display mt-2 text-[1.75rem] leading-none font-bold tracking-tight" aria-describedby={helpId}>
        {value}
      </p>
      {delta && <p className={cn('mt-1 text-sm', deltaTones[delta.tone])}>{delta.text}</p>}
      {help && (
        <p id={helpId} className="text-muted mt-1 text-sm">
          {help}
        </p>
      )}
    </div>
  );
}
