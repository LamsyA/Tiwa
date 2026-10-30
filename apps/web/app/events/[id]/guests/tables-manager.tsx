'use client';

import type { GuestRow } from '@tiwa/core';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FieldShell,
  Input,
  ResponsiveDialog,
  StatusPill,
} from '@tiwa/ui';
import { Armchair } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { ActionResult } from '@/lib/action.js';
import { assignTablesAction, createTableAction, editTable, removeTable } from './actions.js';
import { errorText } from './guests-manager.js';

export interface TableItem {
  id: string;
  name: string;
  capacity: number;
  assigned: number;
}

export function TablesManager({
  eventId,
  tables,
  guests,
  canManage,
}: {
  eventId: string;
  tables: TableItem[];
  guests: GuestRow[];
  canManage: boolean;
}) {
  const t = useTranslations('events.guests');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="font-medium">{t('tables.title')}</h3>
        {canManage && (
          <span className="ml-auto">
            <TableDialog eventId={eventId} />
          </span>
        )}
      </div>
      {tables.length === 0 ? (
        <EmptyState title={t('tables.title')} body={t('tables.empty')} icon={<Armchair aria-hidden />} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => {
            const over = table.assigned > table.capacity;
            return (
              <Card key={table.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium">{table.name}</p>
                  <StatusPill tone={over ? 'warning' : 'neutral'}>
                    {over
                      ? t('tables.overCapacity', { count: table.assigned - table.capacity })
                      : t('tables.assigned', { count: table.assigned, capacity: table.capacity })}
                  </StatusPill>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-1">
                    <AssignDialog eventId={eventId} table={table} guests={guests} />
                    <TableDialog eventId={eventId} table={table} />
                    <DeleteTableButton eventId={eventId} table={table} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TableDialog({ eventId, table }: { eventId: string; table?: TableItem }) {
  const t = useTranslations('events.guests');
  const te = useTranslations('events.guests.errors');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(table?.name ?? '');
  const [capacity, setCapacity] = React.useState(String(table?.capacity ?? 8));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function save() {
    setBusy(true);
    setError(undefined);
    const result: ActionResult<unknown> = table
      ? await editTable({ eventId, tableId: table.id, name, capacity: Number(capacity) })
      : await createTableAction({ eventId, name, capacity: Number(capacity) });
    setBusy(false);
    if (!result.ok) {
      setError(errorText(te, result));
      return;
    }
    setOpen(false);
    if (!table) {
      setName('');
      setCapacity('8');
    }
    router.refresh();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        table ? (
          <Button variant="ghost" size="sm">
            {t('table.edit')}
          </Button>
        ) : (
          <Button variant="secondary">{t('tables.add')}</Button>
        )
      }
      title={table ? table.name : t('tables.add')}
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        <FieldShell id={`table-name-${table?.id ?? 'new'}`} label={t('tables.name')}>
          {(describedBy) => (
            <Input
              id={`table-name-${table?.id ?? 'new'}`}
              aria-describedby={describedBy}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FieldShell>
        <FieldShell id={`table-cap-${table?.id ?? 'new'}`} label={t('tables.capacity')}>
          {(describedBy) => (
            <Input
              id={`table-cap-${table?.id ?? 'new'}`}
              aria-describedby={describedBy}
              type="number"
              min={1}
              inputMode="numeric"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
            />
          )}
        </FieldShell>
        <div>
          <Button disabled={!name.trim() || busy} loading={busy} onClick={() => void save()}>
            {t('tables.save')}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function DeleteTableButton({ eventId, table }: { eventId: string; table: TableItem }) {
  const t = useTranslations('events.guests');
  const te = useTranslations('events.guests.errors');
  const router = useRouter();
  const [error, setError] = React.useState<string | undefined>();
  return (
    <span className="inline-flex flex-col gap-1">
      <ConfirmDialog
        destructive
        trigger={
          <Button variant="ghost" size="sm">
            {t('tables.delete')}
          </Button>
        }
        title={t('tables.delete')}
        body={t('tables.deleteConfirm')}
        confirmLabel={t('tables.delete')}
        onConfirm={() =>
          void removeTable({ eventId, tableId: table.id }).then((result) => {
            if (!result.ok) setError(errorText(te, result));
            else router.refresh();
          })
        }
      />
      {error && <Banner tone="danger">{error}</Banner>}
    </span>
  );
}

function AssignDialog({ eventId, table, guests }: { eventId: string; table: TableItem; guests: GuestRow[] }) {
  const t = useTranslations('events.guests');
  const te = useTranslations('events.guests.errors');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [query, setQuery] = React.useState('');

  const visible = guests.filter((guest) => guest.name.toLowerCase().includes(query.toLowerCase())).slice(0, 100);

  async function confirm() {
    setBusy(true);
    setError(undefined);
    const result = await assignTablesAction({
      eventId,
      assignments: picked.map((guestId) => ({ guestId, tableId: table.id })),
    });
    setBusy(false);
    if (!result.ok) {
      setError(errorText(te, result));
      return;
    }
    setOpen(false);
    setPicked([]);
    setQuery('');
    router.refresh();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPicked([]);
          setQuery('');
        }
      }}
      trigger={
        <Button variant="secondary" size="sm">
          {t('tables.assign')}
        </Button>
      }
      title={t('tables.assign')}
      description={t('tables.pickGuests', { name: table.name })}
    >
      <div className="flex flex-col gap-3">
        {error && <Banner tone="danger">{error}</Banner>}
        <Input
          aria-label={t('searchPlaceholder')}
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex max-h-72 flex-col gap-1 overflow-auto">
          {visible.map((guest) => (
            <label key={guest.id} className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-surface">
              <Checkbox
                checked={picked.includes(guest.id)}
                onCheckedChange={(checked) =>
                  setPicked((current) => (checked ? [...current, guest.id] : current.filter((id) => id !== guest.id)))
                }
                aria-label={guest.name}
              />
              <span className="text-sm font-medium">{guest.name}</span>
            </label>
          ))}
        </div>
        <div>
          <Button disabled={picked.length === 0 || busy} loading={busy} onClick={() => void confirm()}>
            {t('tables.confirm', { count: picked.length })}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
