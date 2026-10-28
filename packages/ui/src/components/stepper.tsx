'use client';

import { Check } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface Step {
  label: string;
  description?: string;
}

/**
 * Wizard stepper. Horizontal with connectors on desktop;
 * compact "Step X of N" on mobile. Never clickable unless
 * `onStepClick` is given (completed steps only, typically).
 */
export function Stepper({
  steps,
  active,
  onStepClick,
  ariaLabel = 'Progress',
  className,
}: {
  steps: Step[];
  active: number;
  onStepClick?: (index: number) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const total = steps.length;
  const current = Math.max(0, Math.min(active, total - 1));
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ol className="hidden md:flex md:items-start">
        {steps.map((step, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'todo';
          const clickable = onStepClick !== undefined && index < current;
          return (
            <li
              key={step.label}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex flex-1 items-start last:flex-none"
            >
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => onStepClick?.(index)}
                  aria-label={`${step.label}${state === 'done' ? ' (completed)' : state === 'current' ? ' (current step)' : ''}`}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border text-sm font-medium',
                    state === 'done' && 'border-brand-strong bg-brand-strong text-on-brand',
                    state === 'current' && 'border-brand-strong text-brand-strong',
                    state === 'todo' && 'border-border text-muted',
                    clickable ? 'cursor-pointer' : 'cursor-default',
                    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                  )}
                >
                  {state === 'done' ? <Check className="size-4" aria-hidden /> : index + 1}
                </button>
                <span
                  className={cn('text-center text-sm', state === 'current' ? 'font-medium text-text' : 'text-muted')}
                >
                  {step.label}
                </span>
              </div>
              {index < total - 1 && (
                <span
                  aria-hidden
                  className={cn('mx-2 mt-4 h-0.5 flex-1 rounded', index < current ? 'bg-brand-strong' : 'bg-border')}
                />
              )}
            </li>
          );
        })}
      </ol>
      <div className="md:hidden">
        <p aria-live="polite" className="text-sm text-muted">
          Step {current + 1} of {total}
        </p>
        <p className="font-medium">{steps[current]?.label}</p>
        <div
          className="bg-surface-2 mt-2 h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={current + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={ariaLabel}
        >
          <div
            className="bg-brand-strong h-full rounded-full transition-[width] duration-fast ease-out"
            style={{ width: `${((current + 1) / total) * 100}%` }}
          />
        </div>
      </div>
    </nav>
  );
}
