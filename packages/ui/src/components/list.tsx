'use client';

import { MoreHorizontal } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.js';
import { IconButton } from './button.js';
import { DropdownMenu, type MenuItem } from './menu.js';

export function List({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-col', className)}>{children}</div>;
}

export interface ListAction extends MenuItem {
  destructive?: boolean;
}

export interface ListItemProps {
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  actions?: ListAction[];
  onOpen?: () => void;
  className?: string;
}

/**
 * Row with leading/trailing slots. Swipe left on touch reveals up to two
 * quick actions; a visible "more" button always offers the same actions
 * (no gesture required, keyboard accessible).
 */
export function ListItem({ leading, title, meta, trailing, actions = [], onOpen, className }: ListItemProps) {
  const [offset, setOffset] = React.useState(0);
  const startX = React.useRef<number | undefined>(undefined);
  const revealed = offset < -24;

  const quick = actions.slice(0, 2);
  const actionWidth = quick.length * 72;

  return (
    <div className={cn('border-border relative overflow-hidden border-b', className)}>
      <div
        className="bg-danger text-on-danger absolute inset-y-0 right-0 flex"
        aria-hidden={!revealed}
        style={{ width: actionWidth }}
      >
        {quick.map((action) => (
          <button
            key={action.label}
            type="button"
            tabIndex={revealed ? 0 : -1}
            onClick={action.onSelect}
            className={cn(
              'flex w-[72px] flex-col items-center justify-center gap-1 text-xs font-medium',
              action.destructive ? 'bg-danger' : 'bg-surface-2 text-text',
            )}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
      <div
        className="bg-bg flex items-center gap-3 px-4 py-3 transition-transform duration-fast ease-out"
        style={{ transform: offset === 0 ? undefined : `translateX(${offset}px)` }}
        onTouchStart={(event) => {
          startX.current = event.touches[0]?.clientX;
        }}
        onTouchMove={(event) => {
          if (startX.current === undefined) return;
          const delta = (event.touches[0]?.clientX ?? 0) - startX.current;
          setOffset(Math.max(-actionWidth, Math.min(0, delta)));
        }}
        onTouchEnd={() => {
          setOffset((current) => (current < -actionWidth / 2 ? -actionWidth : 0));
          startX.current = undefined;
        }}
      >
        {leading}
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
        >
          <span className="block truncate text-base font-medium">{title}</span>
          {meta && <span className="text-muted block truncate text-sm">{meta}</span>}
        </button>
        {trailing}
        {actions.length > 0 && (
          <DropdownMenu
            trigger={
              <IconButton label="More actions" variant="ghost" size="sm">
                <MoreHorizontal className="size-5" aria-hidden />
              </IconButton>
            }
            items={actions.map((action) => ({
              label: action.label,
              icon: action.icon,
              onSelect: action.onSelect,
              disabled: action.disabled,
            }))}
            align="end"
          />
        )}
      </div>
    </div>
  );
}
