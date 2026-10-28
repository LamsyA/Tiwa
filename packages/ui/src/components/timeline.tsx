'use client';

import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface TimelineItem {
  time?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
}

const dotTones = {
  neutral: 'bg-muted',
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/**
 * Vertical timeline with an optional now-line. Used for run-of-show
 * and booking history (`nowLabel` + `nowAfter` place the divider).
 */
export function Timeline({
  items,
  nowLabel,
  nowAfter,
  ariaLabel = 'Timeline',
  className,
}: {
  items: TimelineItem[];
  nowLabel?: string;
  nowAfter?: number;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <ol aria-label={ariaLabel} className={cn('flex flex-col', className)}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <li className="relative flex gap-3 pb-6 last:pb-0">
            <span aria-hidden className="flex flex-col items-center">
              <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', dotTones[item.tone ?? 'neutral'])} />
              {index < items.length - 1 || nowLabel !== undefined ? <span className="bg-border w-px flex-1" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              {item.time && <p className="text-muted text-sm">{item.time}</p>}
              <p className="font-medium">{item.title}</p>
              {item.body && <div className="text-text mt-0.5 text-base">{item.body}</div>}
            </div>
          </li>
          {nowLabel !== undefined && nowAfter === index && (
            <li aria-hidden={false} className="relative flex items-center gap-3 pb-6">
              <span aria-hidden className="bg-brand-strong h-0.5 w-8 rounded-full" />
              <span className="bg-brand-soft text-text rounded-full px-2.5 py-0.5 text-sm font-medium">{nowLabel}</span>
              <span aria-hidden className="bg-brand-strong/40 h-px flex-1" />
            </li>
          )}
        </React.Fragment>
      ))}
    </ol>
  );
}
