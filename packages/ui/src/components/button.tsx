'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-strong text-on-brand hover:brightness-110 shadow-1',
  secondary: 'bg-surface-2 text-text hover:bg-border border border-border',
  ghost: 'text-text hover:bg-surface-2',
  destructive: 'bg-danger text-white hover:brightness-110',
  link: 'text-brand-strong underline-offset-4 hover:underline h-auto min-h-0 px-1',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-base',
  lg: 'h-[52px] px-6 text-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    fullWidth = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium',
        'transition-transform duration-fast ease-out active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-[1.2em] animate-spin" aria-hidden /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  label: string;
}

/** Icon-only button. `label` becomes the required `aria-label`. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', loading = false, label, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const box: Record<ButtonSize, string> = { sm: 'size-9', md: 'size-11', lg: 'size-[52px]' };
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-md',
        'transition-transform duration-fast ease-out active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
        variants[variant],
        box[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-[1.2em] animate-spin" aria-hidden /> : children}
    </button>
  );
});
