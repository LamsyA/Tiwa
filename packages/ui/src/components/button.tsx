'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { buttonClasses, variants, type ButtonSize, type ButtonVariant } from '../lib/button-classes.js';

export type { ButtonSize, ButtonVariant };

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
      className={buttonClasses({ variant, size, fullWidth, className })}
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
