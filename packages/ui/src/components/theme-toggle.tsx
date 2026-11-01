'use client';

import { Moon, Sun } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.js';
import { THEME_COOKIE } from '../theme.js';

/**
 * Light/dark switch: flips `data-theme` on <html> straight away and stores
 * the choice in the theme cookie the no-flash script and root layout read.
 * Before hydration both icons are styled by CSS from `data-theme`, so the
 * button never shows the wrong icon.
 */
export function ThemeToggle({ labels, className }: { labels: { light: string; dark: string }; className?: string }) {
  const toggle = React.useCallback(() => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'dark' ? '#0b0b0f' : '#ffffff');
  }, []);
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'group text-text hover:bg-surface-2 inline-flex size-10 items-center justify-center rounded-full',
        'focus-visible:outline-focus transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
        className,
      )}
    >
      <Moon className="size-5 [[data-theme=dark]_&]:hidden" aria-hidden />
      <Sun className="hidden size-5 [[data-theme=dark]_&]:block" aria-hidden />
      <span className="sr-only [[data-theme=dark]_&]:hidden">{labels.dark}</span>
      <span className="sr-only hidden [[data-theme=dark]_&]:inline">{labels.light}</span>
    </button>
  );
}
