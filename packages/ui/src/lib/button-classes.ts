import { cn } from './cn.js';

// Server-safe button styling (no 'use client'): server components use
// buttonClasses() to make links look and press like buttons.

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-strong text-on-brand shadow-[0_1px_2px_rgb(0_0_0/0.1),inset_0_1px_0_rgb(255_255_255/0.15)] hover:brightness-110',
  secondary:
    'bg-bg text-text border border-border shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:bg-surface hover:border-text/20',
  ghost: 'text-text hover:bg-surface-2',
  destructive: 'bg-danger text-on-danger hover:brightness-110',
  link: 'text-brand-strong underline-offset-4 hover:underline h-auto min-h-0 px-1',
};

export const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-base',
  lg: 'h-[52px] px-6 text-lg',
};

/** Button styling for elements that must stay links (e.g. `<Link>`), so they look and press the same. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string | undefined } = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold',
    'transition-[transform,filter,background-color,border-color] duration-fast ease-out active:scale-[0.98]',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
    className,
  );
}
