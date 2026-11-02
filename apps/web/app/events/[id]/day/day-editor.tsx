'use client';

import { Button, Card, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  addDepAction,
  createItemAction,
  deleteItemAction,
  fromProgrammeAction,
  markLateAction,
  removeDepAction,
  updateItemAction,
  updateStatusAction,
} from './actions.js';
import { loadQueue, loadSnapshotAt, queueMutation, replayQueue, saveSnapshot, type DayMutation } from './day-queue.js';
import { ContactsPanel, IncidentsPanel, type DayContact, type DayIncident } from './day-panels.js';

export interface DayItem {
  id: string;
  dayId: string | null;
  title: string;
  startsAt: string;
  durationMin: number;
  status: string;
  lateByMin: number;
  ownerUserId: string | null;
  ownerOrgId: string | null;
  ownerName: string | null;
  sortOrder: number;
}

interface Owner {
  id: string;
  name: string;
  kind: 'user' | 'org';
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Transitive dependants of a set of items, from the dependency links. */
function closure(roots: string[], dependencies: { itemId: string; dependsOnId: string }[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = children.get(dep.dependsOnId) ?? [];
    list.push(dep.itemId);
    children.set(dep.dependsOnId, list);
  }
  const out = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (out.has(current)) continue;
    out.add(current);
    for (const child of children.get(current) ?? []) queue.push(child);
  }
  for (const root of roots) out.delete(root);
  return out;
}

/** Run-of-show timeline (P12-T02/T03/T06): editor for managers, now-line
 * with auto-scroll, mark-late with dependant highlighting, live refresh,
 * offline snapshot + queued mutations with sync. */
export function DayEditor(props: {
  eventId: string;
  canManage: boolean;
  myUserId: string;
  myOrgIds: string[];
  items: DayItem[];
  dependencies: { itemId: string; dependsOnId: string }[];
  owners: Owner[];
  checkins: { id: string; bookingId: string; userName: string; orgName: string | null; at: string }[];
  incidents: DayIncident[];
  contacts: DayContact[];
  onsiteVendors: { orgId: string; name: string }[];
}) {
  const t = useTranslations('day');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'timeline' | 'mine' | 'incidents' | 'contacts'>('timeline');
  const [title, setTitle] = useState('');
  const [starts, setStarts] = useState('');
  const [duration, setDuration] = useState('15');
  const [justMarked, setJustMarked] = useState<string[]>([]);
  const [now] = useState(() => Date.now());
  const nowRef = useRef<HTMLLIElement | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [queued, setQueued] = useState(() => loadQueue(props.eventId).length);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(() => loadSnapshotAt(props.eventId));
  const [syncing, setSyncing] = useState(false);

  const mine = props.items.filter(
    (row) => row.ownerUserId === props.myUserId || (row.ownerOrgId !== null && props.myOrgIds.includes(row.ownerOrgId)),
  );

  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  useEffect(() => {
    const source = new EventSource(`/api/sse/day/${props.eventId}`);
    source.addEventListener('change', () => router.refresh());
    return () => source.close();
  }, [props.eventId, router]);

  useEffect(() => {
    const onStatus = () => {
      const up = navigator.onLine;
      setOnline(up);
      if (up) {
        void replayQueue(props.eventId).then((result) => {
          setQueued(result.left);
          if (result.left === 0) router.refresh();
        });
      }
    };
    window.addEventListener('online', onStatus);
    window.addEventListener('offline', onStatus);
    if (navigator.onLine) {
      fetch(`/api/day/${props.eventId}/snapshot`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { ok: boolean; data?: unknown } | null) => {
          if (body?.ok) {
            saveSnapshot(props.eventId, body.data);
            setSnapshotAt(new Date().toISOString());
          }
        })
        .catch(() => undefined);
    }
    return () => {
      window.removeEventListener('online', onStatus);
      window.removeEventListener('offline', onStatus);
    };
  }, [props.eventId, router]);

  const lateIds = useMemo(() => props.items.filter((row) => row.status === 'LATE').map((row) => row.id), [props.items]);
  const affected = useMemo(
    () => new Set([...closure(lateIds, props.dependencies), ...justMarked]),
    [lateIds, props.dependencies, justMarked],
  );
  const run = (fn: () => Promise<{ ok: boolean } | Promise<unknown>>) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result && typeof result === 'object' && 'ok' in result && !(result as { ok: boolean }).ok) {
        setError('saveFailed');
      }
    });
  };

  /** Offline-first submit (P12-T06): queue the serializable edit while
   * offline, run it live otherwise. */
  const submit = (mutation: DayMutation | null, fn: () => Promise<{ ok: boolean } | Promise<unknown>>) => {
    if (mutation && !online) {
      setQueued(queueMutation(props.eventId, mutation));
      return;
    }
    run(fn);
  };

  const sync = () => {
    setSyncing(true);
    start(async () => {
      try {
        const result = await replayQueue(props.eventId);
        setQueued(result.left);
        if (!result.ok) setError('saveFailed');
        else router.refresh();
      } finally {
        setSyncing(false);
      }
    });
  };

  const pinOffline = () => {
    start(async () => {
      try {
        const response = await fetch(`/api/day/${props.eventId}/snapshot`);
        const body = (await response.json()) as { ok: boolean; data?: unknown };
        if (body.ok) {
          saveSnapshot(props.eventId, body.data);
          setSnapshotAt(new Date().toISOString());
        } else {
          setError('saveFailed');
        }
      } catch {
        setError('saveFailed');
      }
    });
  };

  const snapshotLabel = useMemo(
    () => (snapshotAt ? new Date(snapshotAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null),
    [snapshotAt],
  );

  const visible = tab === 'mine' ? mine : props.items;
  const shownNowIndex = useMemo(() => {
    const index = visible.findIndex((row) => new Date(row.startsAt).getTime() > now);
    return index === -1 ? visible.length : index;
  }, [visible, now]);
  const rows: { key: string; item?: DayItem; now?: boolean }[] = visible.map((item) => ({
    key: item.id,
    item,
  }));
  if (tab === 'timeline') rows.splice(shownNowIndex, 0, { key: '__now', now: true });

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-danger text-sm">{error}</p>}
      {justMarked.length > 0 && (
        <Card className="border-warning bg-warning-soft text-warning p-3 text-sm" role="status">
          {t('lateNote')}
        </Card>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
        {!online && <span className="rounded-full border px-2 py-0.5">{t('offline')}</span>}
        {queued > 0 && <span>{t('queuedChanges', { count: queued })}</span>}
        <span className="ml-auto" />
        {snapshotLabel && <span className="text-muted">{t('offlineReadyAt', { at: snapshotLabel })}</span>}
        <Button variant="secondary" disabled={pending || syncing} onClick={pinOffline}>
          {t('makeOffline')}
        </Button>
        {queued > 0 && online && (
          <Button disabled={pending || syncing} onClick={sync}>
            {t('syncNow')}
          </Button>
        )}
      </div>
      <div className="flex gap-2" role="tablist" aria-label={t('title')}>
        <Button
          variant={tab === 'timeline' ? 'primary' : 'secondary'}
          onClick={() => setTab('timeline')}
          role="tab"
          aria-selected={tab === 'timeline'}
        >
          {t('timeline')}
        </Button>
        <Button
          variant={tab === 'mine' ? 'primary' : 'secondary'}
          onClick={() => setTab('mine')}
          role="tab"
          aria-selected={tab === 'mine'}
        >
          {t('myTasksTab')} ({mine.length})
        </Button>
        <Button
          variant={tab === 'incidents' ? 'primary' : 'secondary'}
          onClick={() => setTab('incidents')}
          role="tab"
          aria-selected={tab === 'incidents'}
        >
          {t('incidents')}
        </Button>
        <Button
          variant={tab === 'contacts' ? 'primary' : 'secondary'}
          onClick={() => setTab('contacts')}
          role="tab"
          aria-selected={tab === 'contacts'}
        >
          {t('contacts')}
        </Button>
      </div>
      {tab === 'incidents' && (
        <IncidentsPanel
          eventId={props.eventId}
          canManage={props.canManage}
          incidents={props.incidents}
          owners={props.owners}
          submit={submit}
          pending={pending}
        />
      )}
      {tab === 'contacts' && (
        <ContactsPanel
          eventId={props.eventId}
          canManage={props.canManage}
          contacts={props.contacts}
          onsiteVendors={props.onsiteVendors}
          submit={submit}
          pending={pending}
        />
      )}
      {props.checkins.length > 0 && tab === 'timeline' && (
        <Card className="flex flex-col gap-1 p-3 text-sm">
          <h3 className="font-medium">{t('arrivals')}</h3>
          {props.checkins.slice(0, 10).map((row) => (
            <p key={row.id} className="text-muted">
              {row.userName}
              {row.orgName ? ` · ${row.orgName}` : ''} ·{' '}
              {new Date(row.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          ))}
        </Card>
      )}
      {tab === 'mine' && mine.length === 0 && <p className="text-muted text-sm">{t('noMine')}</p>}
      {(tab === 'timeline' || tab === 'mine') && props.canManage && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label={t('itemTitle')}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('itemTitle')}
              className="min-w-40 flex-1"
            />
            <Input
              aria-label={t('startsAt')}
              type="datetime-local"
              value={starts}
              onChange={(event) => setStarts(event.target.value)}
              className="w-52"
            />
            <Input
              aria-label={t('duration')}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              inputMode="numeric"
              className="w-24"
            />
            <Button
              disabled={pending || !title.trim() || !starts}
              onClick={() => {
                const payload = {
                  title: title.trim(),
                  startsAt: new Date(starts).toISOString(),
                  durationMin: /^\d+$/.test(duration) ? Number(duration) : 15,
                };
                submit({ kind: 'item-create', ...payload }, () =>
                  createItemAction({ eventId: props.eventId, ...payload }),
                );
              }}
            >
              {t('addItem')}
            </Button>
          </div>
          <div>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => submit({ kind: 'from-programme' }, () => fromProgrammeAction({ eventId: props.eventId }))}
            >
              {t('fromProgramme')}
            </Button>
          </div>
        </Card>
      )}
      {(tab === 'timeline' || tab === 'mine') && (
        <>
          {props.items.length === 0 && <p className="text-muted text-sm">{t('noItems')}</p>}
          <ul className="flex flex-col gap-2">
            {rows.map((row) =>
              row.now || !row.item ? (
                <li key={row.key} ref={nowRef} aria-hidden className="border-brand-strong relative my-1 border-t-2">
                  <span className="bg-brand-strong absolute -top-2.5 left-0 rounded-full px-2 text-[11px] font-medium text-white">
                    {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ) : (
                <ItemRow
                  key={row.item.id}
                  eventId={props.eventId}
                  row={row.item}
                  canManage={props.canManage}
                  owners={props.owners}
                  dependsOn={props.dependencies.filter((dep) => dep.itemId === row.item!.id)}
                  items={props.items}
                  pending={pending}
                  submit={submit}
                  affected={affected.has(row.item.id)}
                  onMarked={(dependantIds) => setJustMarked(dependantIds)}
                />
              ),
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function ItemRow(props: {
  eventId: string;
  row: DayItem;
  canManage: boolean;
  owners: Owner[];
  dependsOn: { itemId: string; dependsOnId: string }[];
  items: DayItem[];
  pending: boolean;
  submit: (mutation: DayMutation | null, fn: () => Promise<{ ok: boolean } | Promise<unknown>>) => void;
  affected: boolean;
  onMarked: (dependantIds: string[]) => void;
}) {
  const t = useTranslations('day');
  const { row } = props;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(row.title);
  const [starts, setStarts] = useState(toLocalInput(row.startsAt));
  const [duration, setDuration] = useState(String(row.durationMin));
  const [owner, setOwner] = useState(row.ownerUserId ?? row.ownerOrgId ?? '');
  const [link, setLink] = useState('');
  const [lateBy, setLateBy] = useState('15');
  const [lating, setLating] = useState(false);

  const ownerValue = (id: string): { ownerUserId: string | null; ownerOrgId: string | null } => {
    const found = props.owners.find((entry) => entry.id === id);
    if (!found) return { ownerUserId: null, ownerOrgId: null };
    return found.kind === 'user' ? { ownerUserId: id, ownerOrgId: null } : { ownerUserId: null, ownerOrgId: id };
  };

  const markLate = () => {
    if (!/^\d+$/.test(lateBy)) return;
    props.submit({ kind: 'late', itemId: row.id, lateByMin: Number(lateBy) }, async () => {
      setLating(true);
      try {
        const result = await markLateAction({ eventId: props.eventId, itemId: row.id, lateByMin: Number(lateBy) });
        if (result.ok) props.onMarked(result.data?.dependantIds ?? []);
        return result;
      } finally {
        setLating(false);
      }
    });
  };

  return (
    <li
      className={`border-border bg-bg rounded-xl border p-3 text-sm ${row.status === 'LATE' ? 'border-danger' : props.affected ? 'border-warning bg-warning-soft' : ''}`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-muted font-mono">
          {new Date(row.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {row.durationMin}m
        </span>
        <span className="font-medium">{row.title}</span>
        <span className="text-muted">{row.ownerName ?? t('unassigned')}</span>
        <span className="ml-auto rounded-full border px-2 py-0.5 text-xs">
          {row.status}
          {row.status === 'LATE' ? ` +${row.lateByMin}m` : ''}
        </span>
      </div>
      {props.dependsOn.length > 0 && (
        <p className="text-muted mt-1 text-xs">
          {t('dependsOn')}:{' '}
          {props.dependsOn
            .map((dep) => props.items.find((item) => item.id === dep.dependsOnId)?.title ?? '?')
            .join(', ')}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {(row.status === 'PLANNED' || row.status === 'SKIPPED') && (
          <Button
            variant="secondary"
            disabled={props.pending}
            onClick={() =>
              props.submit({ kind: 'status', itemId: row.id, status: 'STARTED' }, () =>
                updateStatusAction({ eventId: props.eventId, itemId: row.id, status: 'STARTED' }),
              )
            }
          >
            {t('start')}
          </Button>
        )}
        {row.status !== 'DONE' && (
          <Button
            variant="secondary"
            disabled={props.pending}
            onClick={() =>
              props.submit({ kind: 'status', itemId: row.id, status: 'DONE' }, () =>
                updateStatusAction({ eventId: props.eventId, itemId: row.id, status: 'DONE' }),
              )
            }
          >
            {t('done')}
          </Button>
        )}
        {props.canManage && (row.status === 'PLANNED' || row.status === 'STARTED') && (
          <>
            <Input
              aria-label={t('lateBy')}
              value={lateBy}
              onChange={(event) => setLateBy(event.target.value)}
              inputMode="numeric"
              className="w-20"
            />
            <Button variant="secondary" disabled={props.pending || lating || !/^\d+$/.test(lateBy)} onClick={markLate}>
              {t('markLate')}
            </Button>
          </>
        )}
        {props.canManage && (
          <>
            <Button variant="ghost" disabled={props.pending} onClick={() => setEditing((open) => !open)}>
              {t('owner')}
            </Button>
            <Button
              variant="ghost"
              disabled={props.pending}
              onClick={() =>
                props.submit({ kind: 'item-delete', itemId: row.id }, () =>
                  deleteItemAction({ eventId: props.eventId, itemId: row.id }),
                )
              }
            >
              {t('delete')}
            </Button>
          </>
        )}
      </div>
      {editing && props.canManage && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            aria-label={t('itemTitle')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="min-w-40 flex-1"
          />
          <Input
            aria-label={t('startsAt')}
            type="datetime-local"
            value={starts}
            onChange={(event) => setStarts(event.target.value)}
            className="w-52"
          />
          <Input
            aria-label={t('duration')}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            inputMode="numeric"
            className="w-24"
          />
          <select
            aria-label={t('owner')}
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className="border-border bg-bg rounded-xl border px-3 py-2"
          >
            <option value="">{t('unassigned')}</option>
            {props.owners.map((entry) => (
              <option key={`${entry.kind}:${entry.id}`} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <Button
            disabled={props.pending || !title.trim() || !starts}
            onClick={() => {
              const payload = {
                title: title.trim(),
                startsAt: new Date(starts).toISOString(),
                durationMin: /^\d+$/.test(duration) ? Number(duration) : 15,
                ...ownerValue(owner),
              };
              props.submit({ kind: 'item-update', itemId: row.id, ...payload }, () =>
                updateItemAction({ eventId: props.eventId, itemId: row.id, ...payload }),
              );
            }}
          >
            {t('owner')}
          </Button>
          <select
            aria-label={t('dependsOn')}
            value={link}
            onChange={(event) => setLink(event.target.value)}
            className="border-border bg-bg rounded-xl border px-3 py-2"
          >
            <option value="">{t('addDep')}</option>
            {props.items
              .filter((item) => item.id !== row.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
          <Button
            variant="secondary"
            disabled={props.pending || !link}
            onClick={() =>
              props.submit({ kind: 'dep-add', itemId: row.id, dependsOnId: link }, () =>
                addDepAction({ eventId: props.eventId, itemId: row.id, dependsOnId: link }),
              )
            }
          >
            {t('addDep')}
          </Button>
          {props.dependsOn.map((dep) => (
            <Button
              key={dep.dependsOnId}
              variant="ghost"
              disabled={props.pending}
              onClick={() =>
                props.submit({ kind: 'dep-remove', itemId: row.id, dependsOnId: dep.dependsOnId }, () =>
                  removeDepAction({ eventId: props.eventId, itemId: row.id, dependsOnId: dep.dependsOnId }),
                )
              }
            >
              ✕ {props.items.find((item) => item.id === dep.dependsOnId)?.title ?? '?'}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
