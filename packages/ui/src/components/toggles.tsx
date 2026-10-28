'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { Check } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.js';

// 44 px hit area: the control is centred in a min-h-11 row so layout stays
// calm while touch targets stay reachable.
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...rest }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'flex min-h-11 min-w-11 items-center justify-center rounded-md',
        'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      <span className="border-border bg-bg flex size-5 items-center justify-center rounded-[6px] border data-[state=checked]:border-brand-strong data-[state=checked]:bg-brand-strong data-[state=checked]:text-on-brand">
        <CheckboxPrimitive.Indicator>
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
});

export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...rest }, ref) {
  return <RadioGroupPrimitive.Root ref={ref} className={cn('flex flex-col gap-1', className)} {...rest} />;
});

export const RadioItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioItem({ className, children, ...rest }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'group flex min-h-11 items-center gap-3 rounded-md',
        'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      <span className="border-border bg-bg flex size-5 items-center justify-center rounded-full border group-data-[state=checked]:border-brand-strong">
        <RadioGroupPrimitive.Indicator className="bg-brand-strong size-2.5 rounded-full" />
      </span>
      {children}
    </RadioGroupPrimitive.Item>
  );
});

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...rest }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'bg-surface-2 border-border flex h-7 min-h-11 min-w-11 items-center rounded-full border px-1.5',
        'data-[state=checked]:border-brand-strong data-[state=checked]:bg-brand-strong',
        'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb className="bg-text block size-5 rounded-full transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-on-brand" />
    </SwitchPrimitive.Root>
  );
});

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

export function SegmentedControl({ options, ariaLabel, className, ...rest }: SegmentedControlProps) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-label={ariaLabel}
      className={cn('bg-surface-2 inline-flex max-w-full gap-1 overflow-x-auto rounded-md p-1', className)}
      {...rest}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          aria-label={typeof option.label === 'string' ? option.label : undefined}
          className={cn(
            'h-9 shrink-0 rounded-[6px] px-3 text-sm font-medium text-muted',
            'hover:text-text data-[state=on]:bg-bg data-[state=on]:text-text data-[state=on]:shadow-1',
            'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
