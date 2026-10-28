'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface TabItem {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  ariaLabel: string;
  className?: string;
  children?: (active: string | undefined) => React.ReactNode;
}

/**
 * Scrollable tab bar (mobile) / inline tabs (desktop). Controlled or
 * uncontrolled; wire `value` to search params for URL-synced tabs.
 */
export function Tabs({ items, ariaLabel, className, children, ...rest }: TabsProps) {
  const [internal, setInternal] = React.useState(rest.defaultValue ?? items[0]?.value);
  const active = rest.value ?? internal;
  return (
    <TabsPrimitive.Root
      value={active}
      onValueChange={(next) => {
        if (rest.value === undefined) setInternal(next);
        rest.onValueChange?.(next);
      }}
      className={className}
    >
      <TabsPrimitive.List
        aria-label={ariaLabel}
        className="scrollbar-none border-border -mx-4 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0"
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={cn(
              'text-muted relative shrink-0 px-3 py-3 text-base font-medium',
              'hover:text-text focus-visible:outline-2 focus-visible:outline-focus',
              'data-[state=active]:text-text data-[state=active]:after:bg-brand-strong',
              'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:content-[""]',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        // forceMount keeps every panel in the DOM so no trigger's
        // aria-controls dangles; Radix hides inactive panels.
        <TabsPrimitive.Content key={item.value} value={item.value} forceMount>
          {active === item.value ? children?.(item.value) : null}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
