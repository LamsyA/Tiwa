import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  href?: string;
  onNavigate?: () => void;
}

/**
 * Card. Whole card clickable via stretched link when `href`/`onNavigate`
 * is given (real link or button, never a div handler).
 */
export function Card({ interactive = false, href, onNavigate, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'border-border bg-surface rounded-lg border shadow-1',
        interactive && 'transition-transform duration-fast ease-out active:scale-[0.99]',
        className,
      )}
      {...rest}
    >
      <div className="relative p-4">
        {href ? (
          <a
            href={href}
            aria-label={typeof children === 'string' ? children : undefined}
            className="after:absolute after:inset-0 after:rounded-lg"
          />
        ) : onNavigate ? (
          <button
            type="button"
            onClick={onNavigate}
            aria-label={typeof children === 'string' ? children : 'Open'}
            className="after:absolute after:inset-0 after:rounded-lg"
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
    <div className={cn('border-border bg-surface rounded-lg border p-4 shadow-1', className)}>
      <p className="text-muted text-sm">{label}</p>
      <p className="font-display mt-1 text-2xl font-bold" aria-describedby={helpId}>
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
