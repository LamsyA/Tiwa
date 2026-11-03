'use client';

import { cn } from '@tiwa/ui';
import { ShieldCheck, Sparkles } from 'lucide-react';
import * as React from 'react';

// Shared look for every AI entry point (P15): a soft gradient-ringed pill,
// a shimmering "thinking" state, and the privacy note that says what the AI
// can and cannot see and that nothing changes until the user confirms.

export const AiTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function AiTrigger({ className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className={cn(
          'group relative inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition',
          'bg-[linear-gradient(var(--bg),var(--bg))_padding-box,linear-gradient(120deg,var(--brand),var(--accent),var(--brand))_border-box]',
          'border-2 border-transparent shadow-[var(--shadow-1)] hover:shadow-[var(--shadow-2)]',
          'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <Sparkles className="text-brand-strong size-4 transition group-hover:rotate-12" aria-hidden />
        {children}
      </button>
    );
  },
);

export function AiThinking({ label }: { label: string }) {
  return (
    <div aria-live="polite" className="flex flex-col gap-2 py-1">
      <div className="bg-surface-2 h-4 w-2/3 animate-pulse rounded-full" />
      <div className="bg-surface-2 h-4 w-full animate-pulse rounded-full" />
      <div className="bg-surface-2 h-4 w-5/6 animate-pulse rounded-full" />
      <p className="text-muted flex items-center gap-1.5 text-xs">
        <Sparkles className="size-3.5 animate-pulse" aria-hidden />
        {label}
      </p>
    </div>
  );
}

export function AiNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 flex items-start gap-2.5 rounded-2xl px-3 py-2.5 text-xs">
      <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

/** The specific reason behind a failed AI action (e.g. "noBudget"), else the error code. */
export function aiErrorKey(result: { code: string; fieldErrors?: Record<string, string[] | undefined> }): string {
  return result.fieldErrors?.ai?.[0] ?? result.code;
}
