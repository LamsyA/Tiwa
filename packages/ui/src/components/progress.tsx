'use client';

import { cn } from '../lib/cn.js';

export interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  className?: string;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

/** Linear progress with full `progressbar` semantics. */
export function ProgressBar({ value, max = 100, label = 'Progress', showValue = false, className }: ProgressProps) {
  const safeMax = max <= 0 ? 100 : max;
  const safe = clamp(value, safeMax);
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted">{label}</span>
          {showValue && (
            <span className="text-sm font-medium" aria-hidden>
              {Math.round((safe / safeMax) * 100)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(safe)}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        className="bg-surface-2 h-2 overflow-hidden rounded-full"
      >
        <div
          className="bg-brand-strong h-full rounded-full transition-[width] duration-fast ease-out"
          style={{ width: `${(safe / safeMax) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Ring progress with full `progressbar` semantics. */
export function ProgressRing({
  value,
  max = 100,
  size = 64,
  stroke = 6,
  label = 'Progress',
  showValue = true,
  className,
}: ProgressProps & { size?: number; stroke?: number }) {
  const safeMax = max <= 0 ? 100 : max;
  const safe = clamp(value, safeMax);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = safe / safeMax;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(safe)}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-brand-strong transition-[stroke-dashoffset] duration-fast ease-out"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      {showValue && (
        <span className="text-sm font-medium" aria-hidden>
          {Math.round(fraction * 100)}%
        </span>
      )}
    </div>
  );
}
