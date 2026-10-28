'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean | undefined;
}

export function DropdownMenu({
  trigger,
  items,
  label,
  align = 'start',
}: {
  trigger: React.ReactNode;
  items: MenuItem[];
  label?: string;
  align?: 'start' | 'end' | 'center';
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          sideOffset={6}
          className="border-border bg-bg z-50 min-w-44 rounded-lg border p-1 shadow-2"
        >
          {label && (
            <DropdownMenuPrimitive.Label className="text-muted px-3 py-2 text-sm">{label}</DropdownMenuPrimitive.Label>
          )}
          {items.map((item) => (
            <DropdownMenuPrimitive.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-[6px] px-3 py-2.5 text-base outline-none',
                'focus:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {item.icon && (
                <span aria-hidden className="text-muted">
                  {item.icon}
                </span>
              )}
              {item.label}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export function Popover({
  trigger,
  children,
  align = 'start',
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end' | 'center';
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={6}
          className="border-border bg-bg z-50 rounded-lg border p-2 shadow-2"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function CheckItem({ checked, children }: { checked?: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      {checked !== undefined && (
        <span aria-hidden className="text-brand-strong w-4">
          {checked && <Check className="size-4" />}
        </span>
      )}
      {children}
    </span>
  );
}
