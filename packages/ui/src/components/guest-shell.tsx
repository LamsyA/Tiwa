import type * as React from 'react';
import { cn } from '../lib/cn.js';

// Guest frame (Frontend.md §5.5): no app chrome, 560 px centred column,
// cover header, sticky bottom action with safe-area padding, small
// Tiwa mark in the footer only.
//
// Deliberately server-rendered (no 'use client'): the public invite and
// pass pages must stay tiny (P4-T12 JS budget). It lived in shell.tsx
// before; AppShell's interactivity forced the whole file client-side.

export interface GuestShellProps {
  cover?: React.ReactNode;
  coverAlt?: string;
  title: string;
  action?: React.ReactNode;
  footerNote?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function GuestShell({ cover, coverAlt, title, action, footerNote, children, className }: GuestShellProps) {
  return (
    <div data-frame="guest" className={cn('mx-auto flex min-h-dvh w-full max-w-[560px] flex-col', className)}>
      {(cover ?? coverAlt) && (
        <div className="relative aspect-video max-h-[280px] w-full overflow-hidden bg-surface-2">
          {cover ?? (
            <div
              role="img"
              aria-label={coverAlt}
              className="bg-gradient-to-br from-brand-soft to-surface-2 size-full"
            />
          )}
        </div>
      )}
      <main className="flex-1 px-4 pb-4">
        <h1 className="font-display pt-4 text-2xl font-bold">{title}</h1>
        <div className="mt-2">{children}</div>
      </main>
      {action && (
        <div
          className="bg-bg/95 sticky bottom-0 z-30 border-t border-border px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {action}
        </div>
      )}
      <footer className="text-muted flex flex-col items-center gap-1 px-4 py-6 text-xs">
        <span className="font-display text-sm font-bold text-text">Tiwa</span>
        {footerNote}
      </footer>
    </div>
  );
}
