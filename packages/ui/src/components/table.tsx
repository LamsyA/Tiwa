'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.js';
import { Checkbox } from './toggles.js';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  renderCard?: (row: T) => React.ReactNode;
  emptyText?: string;
  ariaLabel: string;
  className?: string;
}

/**
 * Table on `md+`, cards below (both rendered, CSS hides one).
 * Sorting by header tap; row selection via checkboxes.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  renderCard,
  emptyText = 'Nothing here yet',
  ariaLabel,
  className,
}: DataTableProps<T>) {
  const [internal, setInternal] = React.useState<string[]>([]);
  const selected = selectedKeys ?? internal;
  const [sort, setSort] = React.useState<{ key: string; dir: 'asc' | 'desc' } | undefined>(undefined);

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = column.sortValue!(a);
      const vb = column.sortValue!(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * factor;
    });
  }, [rows, sort, columns]);

  function toggle(key: string) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    if (selectedKeys === undefined) setInternal(next);
    onSelectionChange?.(next);
  }

  function toggleAll() {
    const all = rows.map((row, index) => rowKey(row, index));
    const next = selected.length === all.length ? [] : all;
    if (selectedKeys === undefined) setInternal(next);
    onSelectionChange?.(next);
  }

  function toggleSort(column: Column<T>) {
    if (!column.sortable) return;
    setSort((current) =>
      current?.key !== column.key
        ? { key: column.key, dir: 'asc' }
        : current.dir === 'asc'
          ? { key: column.key, dir: 'desc' }
          : undefined,
    );
  }

  if (rows.length === 0) {
    return (
      <p className={cn('text-muted px-3 py-8 text-center text-base', className)} role="status">
        {emptyText}
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="border-border hidden overflow-x-auto rounded-lg border md:block">
        <table aria-label={ariaLabel} className="w-full text-left text-base">
          <thead className="bg-surface text-muted sticky top-0 text-sm">
            <tr>
              {selectable && (
                <th className="w-11 px-2 py-3">
                  <Checkbox
                    aria-label="Select all rows"
                    checked={selected.length === rows.length && rows.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-3 py-3 font-medium"
                  aria-sort={
                    column.sortable
                      ? sort?.key === column.key
                        ? sort.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      aria-label={`Sort by ${typeof column.header === 'string' ? column.header : column.key}`}
                      className="focus-visible:outline-2 focus-visible:outline-focus inline-flex items-center gap-1 rounded focus-visible:outline-offset-2"
                    >
                      {column.header}
                      {sort?.key === column.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="size-4" aria-hidden />
                        ) : (
                          <ArrowDown className="size-4" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="text-muted size-4" aria-hidden />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, index) => {
              const key = rowKey(row, index);
              return (
                <tr key={key} className="border-border border-t">
                  {selectable && (
                    <td className="px-2 py-3">
                      <Checkbox
                        aria-label={`Select row ${index + 1}`}
                        checked={selected.includes(key)}
                        onCheckedChange={() => toggle(key)}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-3">
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {renderCard && (
        <div className="flex flex-col gap-3 md:hidden" role="list" aria-label={ariaLabel}>
          {sorted.map((row, index) => (
            <div key={rowKey(row, index)} role="listitem">
              {selectable && (
                <div className="mb-1 flex justify-end">
                  <Checkbox
                    aria-label={`Select row ${index + 1}`}
                    checked={selected.includes(rowKey(row, index))}
                    onCheckedChange={() => toggle(rowKey(row, index))}
                  />
                </div>
              )}
              {renderCard(row)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
