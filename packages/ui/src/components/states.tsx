'use client';

import * as React from 'react';
import { cn } from '../lib/cn.js';

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
      {icon && (
        <span aria-hidden className="text-muted bg-surface flex size-12 items-center justify-center rounded-full">
          {icon}
        </span>
      )}
      <p className="text-lg font-medium">{title}</p>
      {body && <p className="text-muted max-w-sm text-base">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function shimmer(disabled = false): string {
  return disabled ? '' : 'animate-pulse';
}

export function Skeleton({
  variant = 'text',
  className,
}: {
  variant?: 'text' | 'block' | 'avatar' | 'grid';
  className?: string;
}) {
  if (variant === 'text') {
    return (
      <div role="status" aria-label="Loading" className={cn('flex flex-col gap-2', className)}>
        <div className={cn('bg-surface-2 h-4 w-3/4 rounded', shimmer())} />
        <div className={cn('bg-surface-2 h-4 w-1/2 rounded', shimmer())} />
      </div>
    );
  }
  if (variant === 'avatar') {
    return (
      <div role="status" aria-label="Loading" className={cn('flex items-center gap-3', className)}>
        <div className={cn('bg-surface-2 size-10 rounded-full', shimmer())} />
        <div className={cn('bg-surface-2 h-4 w-32 rounded', shimmer())} />
      </div>
    );
  }
  if (variant === 'grid') {
    return (
      <div role="status" aria-label="Loading" className={cn('grid grid-cols-3 gap-2', className)}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={cn('bg-surface-2 aspect-square rounded-md', shimmer())} />
        ))}
      </div>
    );
  }
  return (
    <div role="status" aria-label="Loading" className={cn('bg-surface-2 h-24 rounded-lg', shimmer(), className)} />
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-focus/40 bg-surface',
    warning: 'border-warning/40 bg-warning-soft',
    danger: 'border-danger/40 bg-danger-soft',
  };
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn('rounded-lg border p-3 text-base', tones[tone], className)}
    >
      {title && <p className="font-medium">{title}</p>}
      <div className={tone === 'info' ? 'text-text' : ''}>{children}</div>
    </div>
  );
}
