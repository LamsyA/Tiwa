'use client';

import type { GuestRow, HeadcountReport } from '@tiwa/core';
import {
  Avatar,
  Banner,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Input,
  Select,
  StatusPill,
  Tabs,
  cn,
} from '@tiwa/ui';
import { Plus, Search, Upload, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useLive } from '@/hooks/use-live.js';
import type { ActionResult } from '@/lib/action.js';
import { assignGroupsAction, removeGuests } from './actions.js';
import {
  AddGuestDialog,
  ContactsButton,
  CsvDialog,
  EditGuestDialog,
  MergeDialog,
  PasteDialog,
  type AddedGuestContact,
} from './guest-dialogs.js';
import { GroupsManager } from './groups-manager.js';
import { HeadcountPanel } from './headcount-report.js';
import { TablesManager, type TableItem } from './tables-manager.js';

export interface GuestGroupItem {
  id: string;
  name: string;
  color: string | null;
  memberCount: number;
}

export interface GuestsManagerProps {
  eventId: string;
  canManage: boolean;
  counts: { total: number; yes: number; no: number; maybe: number; none: number; checkedIn: number };
  guests: GuestRow[];
  total: number;
  redacted: boolean;
  groups: GuestGroupItem[];
  filters: { q: string; group: string; rsvp: string; checkedIn: string };
  tab: 'list' | 'groups' | 'tables' | 'headcount';
  tables: TableItem[];
  report: HeadcountReport | null;
  appUrl: string;
}

export function errorText(t: (key: string) => string, result: Extract<ActionResult<unknown>, { ok: false }>): string {
  const key = result.fieldErrors ? Object.values(result.fieldErrors).flat()[0] : undefined;
  if (key) {
    try {
      return t(key);
    } catch {
      // fall through to the code lookup
    }
  }
  try {
    return t(result.code);
  } catch {
    return t('generic');
  }
}

export function GuestsManager(props: GuestsManagerProps) {
  const { eventId, canManage, counts, guests, redacted, groups, filters, tab, tables, report, appUrl } = props;
  const t = useTranslations('events.guests');
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState(filters.q);

  useLive(`/api/sse/event/${eventId}`, () => router.refresh());

  function setFilter(patch: Partial<GuestsManagerProps['filters']> & { tab?: string }) {
    const params = new URLSearchParams();
    const next = { ...filters, ...patch };
    if (next.q) params.set('q', next.q);
    if (next.group) params.set('group', next.group);
    if (next.rsvp) params.set('rsvp', next.rsvp);
    if (next.checkedIn) params.set('checkedIn', next.checkedIn);
    const tabValue = patch.tab ?? tab;
    if (tabValue !== 'list') params.set('tab', tabValue);
    const suffix = params.toString();
    router.replace(`/events/${eventId}/guests${suffix ? `?${suffix}` : ''}`);
  }

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== filters.q) setFilter({ q: query });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const groupName = (id: string) => groups.find((group) => group.id === id)?.name ?? id;
  const counters = [
    { label: t('counters.invited'), value: counts.total },
    { label: t('counters.yes'), value: counts.yes },
    { label: t('counters.no'), value: counts.no },
    { label: t('counters.noReply'), value: counts.none + counts.maybe },
    { label: t('counters.checkedIn'), value: counts.checkedIn },
  ];

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-bold">{t('title')}</h2>
        {canManage && (
          <div className="ml-auto flex flex-wrap gap-2">
            <AddGuestDialog eventId={eventId} groups={groups} />
            <PasteDialog eventId={eventId} />
            <CsvDialog eventId={eventId} total={counts.total} />
          </div>
        )}
      </div>
      {!canManage && <Banner tone="info">{t('readOnly')}</Banner>}

      <div className="grid grid-cols-5 gap-2">
        {counters.map((counter) => (
          <Card key={counter.label} className="p-3 text-center">
            <p className="font-display text-xl font-bold">{counter.value}</p>
            <p className="text-muted text-xs">{counter.label}</p>
          </Card>
        ))}
      </div>

      <Tabs
        ariaLabel={t('title')}
        value={tab}
        onValueChange={(value) => setFilter({ tab: value })}
        items={[
          { value: 'list', label: t('tabs.list') },
          { value: 'groups', label: t('tabs.groups') },
          { value: 'tables', label: t('tabs.tables') },
          ...(canManage && report ? [{ value: 'headcount', label: t('tabs.headcount') }] : []),
        ]}
      />

      {tab === 'groups' ? (
        <GroupsManager eventId={eventId} groups={groups} canManage={canManage} />
      ) : tab === 'tables' ? (
        <TablesManager eventId={eventId} tables={tables} guests={guests} canManage={canManage} />
      ) : tab === 'headcount' && canManage && report ? (
        <HeadcountPanel eventId={eventId} report={report} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <Input
                aria-label={t('searchPlaceholder')}
                placeholder={t('searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                prefix={<Search aria-hidden className="size-4" />}
              />
            </div>
            <Select
              aria-label={t('filters.allGroups')}
              value={filters.group}
              options={[
                { value: '', label: t('filters.allGroups') },
                ...groups.map((group) => ({ value: group.id, label: group.name })),
              ]}
              onValueChange={(value) => setFilter({ group: value })}
            />
            <Select
              aria-label={t('filters.allRsvp')}
              value={filters.rsvp}
              options={[
                { value: '', label: t('filters.allRsvp') },
                { value: 'YES', label: t('rsvpLabels.YES') },
                { value: 'NO', label: t('rsvpLabels.NO') },
                { value: 'MAYBE', label: t('rsvpLabels.MAYBE') },
                { value: 'NONE', label: t('rsvpLabels.NONE') },
              ]}
              onValueChange={(value) => setFilter({ rsvp: value })}
            />
            {(filters.q || filters.group || filters.rsvp || filters.checkedIn) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setQuery('');
                  setFilter({ q: '', group: '', rsvp: '', checkedIn: '' });
                }}
              >
                {t('filters.clear')}
              </Button>
            )}
          </div>

          {guests.length === 0 && !filters.q && !filters.group && !filters.rsvp ? (
            <GuestEmptyState eventId={eventId} groups={groups} canManage={canManage} />
          ) : (
            <DataTable<GuestRow>
              ariaLabel={t('title')}
              rows={guests}
              rowKey={(row) => row.id}
              selectable={canManage}
              selectedKeys={selected}
              onSelectionChange={setSelected}
              columns={[
                {
                  key: 'name',
                  header: t('table.name'),
                  cell: (row) => (
                    <span className="flex items-center gap-2">
                      <Avatar name={row.name} size="sm" />
                      <span className="font-medium">{row.name}</span>
                    </span>
                  ),
                  sortable: true,
                  sortValue: (row) => row.name,
                },
                {
                  key: 'contact',
                  header: t('table.contact'),
                  cell: (row) =>
                    redacted ? (
                      <span className="text-muted text-sm">{t('table.redacted')}</span>
                    ) : (
                      <span className="text-sm">{row.phone ?? row.email ?? t('table.noContact')}</span>
                    ),
                },
                {
                  key: 'groups',
                  header: t('table.groups'),
                  cell: (row) => (
                    <span className="flex flex-wrap gap-1">
                      {row.groupIds.map((id) => (
                        <Chip key={id}>{groupName(id)}</Chip>
                      ))}
                    </span>
                  ),
                },
                {
                  key: 'rsvp',
                  header: t('table.rsvp'),
                  cell: (row) => (
                    <StatusPill tone={row.rsvp === 'YES' ? 'success' : row.rsvp === 'NO' ? 'danger' : 'neutral'}>
                      {t(`rsvpLabels.${row.rsvp}` as 'rsvpLabels.YES')}
                    </StatusPill>
                  ),
                },
                ...(canManage
                  ? [
                      {
                        key: 'actions',
                        header: '',
                        cell: (row: GuestRow) => <EditGuestDialog eventId={eventId} guest={row} appUrl={appUrl} />,
                      } satisfies { key: string; header: string; cell: (row: GuestRow) => React.ReactNode },
                    ]
                  : []),
              ]}
              renderCard={(row) => (
                <Card className="flex items-center gap-3 p-3">
                  <Avatar name={row.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className="text-muted block truncate text-sm">
                      {redacted ? t('table.redacted') : (row.phone ?? row.email ?? t('table.noContact'))}
                    </span>
                  </span>
                  <StatusPill tone={row.rsvp === 'YES' ? 'success' : row.rsvp === 'NO' ? 'danger' : 'neutral'}>
                    {t(`rsvpLabels.${row.rsvp}` as 'rsvpLabels.YES')}
                  </StatusPill>
                </Card>
              )}
            />
          )}

          {canManage && selected.length > 0 && (
            <BulkBar eventId={eventId} selected={selected} groups={groups} onDone={() => setSelected([])} />
          )}
        </div>
      )}
      <MergePrompt eventId={eventId} />
    </div>
  );
}

function BulkBar({
  eventId,
  selected,
  groups,
  onDone,
}: {
  eventId: string;
  selected: string[];
  groups: GuestGroupItem[];
  onDone: () => void;
}) {
  const t = useTranslations('events.guests');
  const te = useTranslations('events.guests.errors');
  const router = useRouter();
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  async function run(work: () => Promise<ActionResult<unknown>>) {
    setBusy(true);
    setError(undefined);
    try {
      const result = await work();
      if (!result.ok) setError(errorText(te, result));
      else {
        onDone();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        'bg-surface sticky bottom-16 z-10 flex flex-wrap items-center gap-2 rounded-lg border p-3 shadow-lg lg:bottom-4',
      )}
    >
      <p className="text-sm font-medium">{t('bulk.selected', { count: selected.length })}</p>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select
          aria-label={t('bulk.group')}
          value=""
          options={[
            { value: '', label: t('bulk.group') },
            ...groups.map((group) => ({ value: group.id, label: group.name })),
          ]}
          onValueChange={(value) => {
            if (value) void run(() => assignGroupsAction({ eventId, guestIds: selected, groupIds: [value] }));
          }}
        />
        <ConfirmDialog
          destructive
          trigger={
            <Button variant="destructive" disabled={busy}>
              {t('bulk.delete')}
            </Button>
          }
          title={t('bulk.delete')}
          body={t('bulk.selected', { count: selected.length })}
          confirmLabel={t('bulk.delete')}
          onConfirm={() => void run(() => removeGuests({ eventId, guestIds: selected }))}
        />
        <Button variant="ghost" onClick={onDone}>
          {t('bulk.clear')}
        </Button>
      </div>
    </div>
  );
}

/** Merge prompt state lives here so any add flow (manual/paste/csv/contacts) can raise it. */
export interface DuplicateGuest {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}
const mergeStore: { open: (duplicates: DuplicateGuest[], added: AddedGuestContact[]) => void } = {
  open: () => undefined,
};

export function raiseMergePrompt(duplicates: DuplicateGuest[], added: AddedGuestContact[]) {
  mergeStore.open(duplicates, added);
}

function MergePrompt({ eventId }: { eventId: string }) {
  const te = useTranslations('events.guests.errors');
  const router = useRouter();
  const [state, setState] = React.useState<{ duplicates: DuplicateGuest[]; added: AddedGuestContact[] } | null>(null);
  React.useEffect(() => {
    mergeStore.open = (duplicates, added) => setState({ duplicates, added });
  }, []);
  if (!state) return null;
  return (
    <MergeDialog
      eventId={eventId}
      duplicates={state.duplicates}
      added={state.added}
      onClose={() => {
        setState(null);
        router.refresh();
      }}
      errorText={(result) => errorText(te, result)}
    />
  );
}

function GuestEmptyState({
  eventId,
  groups,
  canManage,
}: {
  eventId: string;
  groups: GuestGroupItem[];
  canManage: boolean;
}) {
  const t = useTranslations('events.guests');
  if (!canManage) return <EmptyState title={t('empty.title')} body={t('readOnly')} icon={<Users aria-hidden />} />;
  return (
    <EmptyState
      title={t('empty.title')}
      body={t('empty.body')}
      icon={<Users aria-hidden />}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <AddGuestDialog
            eventId={eventId}
            groups={groups}
            triggerLabel={t('empty.add')}
            triggerIcon={<Plus aria-hidden className="size-4" />}
          />
          <PasteDialog eventId={eventId} triggerLabel={t('empty.paste')} />
          <CsvDialog
            eventId={eventId}
            total={0}
            triggerLabel={t('empty.csv')}
            triggerIcon={<Upload aria-hidden className="size-4" />}
          />
          <ContactsButton eventId={eventId} label={t('empty.contacts')} />
        </div>
      }
    />
  );
}
