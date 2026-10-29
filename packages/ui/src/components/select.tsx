'use client';

import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface PickerProps {
  options?: Option[];
  loadOptions?: (query: string) => Promise<Option[]>;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  id?: string;
  emptyText?: string;
  /** Accessible name when there is no visible `label`. */
  'aria-label'?: string;
}

function useOptions(
  options: Option[] | undefined,
  loadOptions: ((query: string) => Promise<Option[]>) | undefined,
  open: boolean,
  query: string,
) {
  const [asyncOptions, setAsyncOptions] = React.useState<Option[] | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const requestId = React.useRef(0);

  React.useEffect(() => {
    if (!open || !loadOptions) return;
    const current = (requestId.current += 1);
    setLoading(true);
    const timer = setTimeout(() => {
      void loadOptions(query)
        .then((result) => {
          if (requestId.current === current) setAsyncOptions(result);
        })
        .catch(() => {
          if (requestId.current === current) setAsyncOptions([]);
        })
        .finally(() => {
          if (requestId.current === current) setLoading(false);
        });
    }, 150);
    return () => clearTimeout(timer);
  }, [open, query, loadOptions]);

  return { list: loadOptions ? (asyncOptions ?? []) : (options ?? []), loading: Boolean(loadOptions && loading) };
}

function PickerList({
  list,
  loading,
  query,
  activeValue,
  onPick,
  emptyText,
  allowCustom,
  onCustom,
}: {
  list: Option[];
  loading: boolean;
  query: string;
  activeValue: string | undefined;
  onPick: (value: string) => void;
  emptyText: string;
  allowCustom: boolean;
  onCustom: () => void;
}) {
  const [active, setActive] = React.useState(0);
  const buttons = React.useRef<Array<HTMLButtonElement | null>>([]);
  const filtered = list.filter(
    (option) => option.label.toLowerCase().includes(query.toLowerCase()) || option.value === activeValue,
  );
  const items: Array<Option & { custom?: boolean }> =
    allowCustom && query && !filtered.some((o) => o.label.toLowerCase() === query.toLowerCase())
      ? [...filtered, { value: `custom:${query}`, label: `Use "${query}"`, custom: true }]
      : filtered;

  React.useEffect(() => setActive(0), [query, list.length]);

  function focusItem(index: number) {
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    setActive(clamped);
    buttons.current[clamped]?.focus();
  }

  if (loading) {
    return (
      <p className="text-muted flex items-center gap-2 px-3 py-6 text-sm" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }
  if (items.length === 0) {
    return <p className="text-muted px-3 py-6 text-center text-sm">{emptyText}</p>;
  }
  return (
    <ul
      role="listbox"
      aria-label="Options"
      className="max-h-64 overflow-auto p-1"
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          focusItem(active + 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          focusItem(active - 1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          focusItem(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          focusItem(items.length - 1);
        }
      }}
    >
      {items.map((item, index) => {
        const custom = 'custom' in item;
        const realValue = custom ? query : item.value;
        return (
          <li key={item.value} role="option" aria-selected={activeValue === realValue}>
            <button
              type="button"
              ref={(element) => {
                buttons.current[index] = element;
              }}
              disabled={item.disabled}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onClick={() => (custom ? onCustom() : onPick(item.value))}
              className={cn(
                'flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-base',
                index === active && 'bg-surface-2',
                item.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <span className="flex-1 truncate">{item.label}</span>
              {activeValue === realValue && !custom && <Check className="text-brand-strong size-4" aria-hidden />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Picker({
  options,
  loadOptions,
  value: controlled,
  defaultValue,
  onValueChange,
  placeholder = 'Select…',
  disabled,
  searchable: searchableProp,
  className,
  id,
  allowCustom = false,
  emptyText = 'No matches found',
  'aria-label': ariaLabel,
}: PickerProps & { allowCustom?: boolean }) {
  const [internal, setInternal] = React.useState(defaultValue ?? '');
  const value = controlled ?? internal;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const searchable = (searchableProp ?? (options !== undefined && options.length > 7)) || loadOptions !== undefined;
  const { list, loading } = useOptions(options, loadOptions, open, query);
  const selected = [...list, ...(options ?? [])].find((o) => o.value === value);

  function pick(next: string) {
    if (controlled === undefined) setInternal(next);
    onValueChange?.(next);
    setOpen(false);
    setQuery('');
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            'border-border bg-bg text-text flex h-11 w-full items-center justify-between gap-2 rounded-md border px-3 text-base',
            'focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !selected && 'text-muted',
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className="text-muted size-4 shrink-0" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="border-border bg-bg z-50 w-[var(--radix-popover-trigger-width)] rounded-md border shadow-2"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {searchable && (
            <div className="border-border border-b p-1">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search…"
                aria-label="Search options"
                className="bg-surface text-text placeholder:text-muted h-9 w-full rounded-[6px] px-3 text-base focus:outline-none"
              />
            </div>
          )}
          <PickerList
            list={list}
            loading={loading}
            query={searchable ? query : ''}
            activeValue={value || undefined}
            onPick={pick}
            emptyText={emptyText}
            allowCustom={allowCustom}
            onCustom={() => pick(query)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export interface SelectProps extends PickerProps {
  label?: React.ReactNode;
}

/** Visible label above the trigger, tied to it with htmlFor (a button is labelable). */
function Labelled({
  label,
  id,
  children,
}: {
  label: React.ReactNode | undefined;
  id: string;
  children: React.ReactNode;
}) {
  if (label === undefined) return <>{children}</>;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-text">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Dropdown select: search appears for long static lists or async sources. */
export function Select({ label, id, ...props }: SelectProps) {
  const autoId = React.useId();
  const triggerId = id ?? autoId;
  return (
    <Labelled label={label} id={triggerId}>
      <Picker {...props} id={triggerId} />
    </Labelled>
  );
}

export interface ComboboxProps extends PickerProps {
  label?: React.ReactNode;
}

/**
 * Combobox: filterable picker that also accepts a custom value
 * (Enter on `Use "…"`) when nothing matches.
 */
export function Combobox({ searchable = true, label, id, ...props }: ComboboxProps) {
  const autoId = React.useId();
  const triggerId = id ?? autoId;
  return (
    <Labelled label={label} id={triggerId}>
      <Picker {...props} id={triggerId} searchable={searchable} allowCustom />
    </Labelled>
  );
}
