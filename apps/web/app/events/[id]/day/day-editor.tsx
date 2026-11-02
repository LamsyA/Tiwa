'use client';

import { Button, Card, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import {
  addDepAction,
  createItemAction,
  deleteItemAction,
  fromProgrammeAction,
  removeDepAction,
  updateItemAction,
  updateStatusAction,
} from './actions.js';

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

/** Run-of-show editor (P12-T02): add items, create from programme, owners,
 * durations, dependency links, status moves. Late flow arrives in P12-T03. */
export function DayEditor(props: {
  eventId: string;
  canManage: boolean;
  items: DayItem[];
  dependencies: { itemId: string; dependsOnId: string }[];
  owners: Owner[];
}) {
  const t = useTranslations('day');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [starts, setStarts] = useState('');
  const [duration, setDuration] = useState('15');

  const run = (fn: () => Promise<{ ok: boolean } | Promise<unknown>>) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result && typeof result === 'object' && 'ok' in result && !(result as { ok: boolean }).ok) {
        setError('saveFailed');
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-danger text-sm">{error}</p>}
      {props.canManage && (
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
              onClick={() =>
                run(() =>
                  createItemAction({
                    eventId: props.eventId,
                    title: title.trim(),
                    startsAt: new Date(starts).toISOString(),
                    durationMin: /^\d+$/.test(duration) ? Number(duration) : 15,
                  }),
                )
              }
            >
              {t('addItem')}
            </Button>
          </div>
          <div>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => fromProgrammeAction({ eventId: props.eventId }))}
            >
              {t('fromProgramme')}
            </Button>
          </div>
        </Card>
      )}
      {props.items.length === 0 && <p className="text-muted text-sm">{t('noItems')}</p>}
      <ul className="flex flex-col gap-2">
        {props.items.map((row) => (
          <ItemRow
            key={row.id}
            eventId={props.eventId}
            row={row}
            canManage={props.canManage}
            owners={props.owners}
            dependsOn={props.dependencies.filter((dep) => dep.itemId === row.id)}
            items={props.items}
            pending={pending}
            run={run}
          />
        ))}
      </ul>
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
  run: (fn: () => Promise<{ ok: boolean } | Promise<unknown>>) => void;
}) {
  const t = useTranslations('day');
  const { row } = props;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(row.title);
  const [starts, setStarts] = useState(toLocalInput(row.startsAt));
  const [duration, setDuration] = useState(String(row.durationMin));
  const [owner, setOwner] = useState(row.ownerUserId ?? row.ownerOrgId ?? '');
  const [link, setLink] = useState('');

  const ownerValue = (id: string): { ownerUserId: string | null; ownerOrgId: string | null } => {
    const found = props.owners.find((entry) => entry.id === id);
    if (!found) return { ownerUserId: null, ownerOrgId: null };
    return found.kind === 'user' ? { ownerUserId: id, ownerOrgId: null } : { ownerUserId: null, ownerOrgId: id };
  };

  return (
    <li className="border-border bg-bg rounded-xl border p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-muted font-mono">
          {new Date(row.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {row.durationMin}m
        </span>
        <span className="font-medium">{row.title}</span>
        <span className="text-muted">{row.ownerName ?? t('unassigned')}</span>
        <span className="ml-auto rounded-full border px-2 py-0.5 text-xs">{row.status}</span>
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
        {row.status === 'PLANNED' && (
          <Button
            variant="secondary"
            disabled={props.pending}
            onClick={() =>
              props.run(() => updateStatusAction({ eventId: props.eventId, itemId: row.id, status: 'STARTED' }))
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
              props.run(() => updateStatusAction({ eventId: props.eventId, itemId: row.id, status: 'DONE' }))
            }
          >
            {t('done')}
          </Button>
        )}
        {props.canManage && (
          <>
            <Button variant="ghost" disabled={props.pending} onClick={() => setEditing((open) => !open)}>
              {t('owner')}
            </Button>
            <Button
              variant="ghost"
              disabled={props.pending}
              onClick={() => props.run(() => deleteItemAction({ eventId: props.eventId, itemId: row.id }))}
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
            onClick={() =>
              props.run(() =>
                updateItemAction({
                  eventId: props.eventId,
                  itemId: row.id,
                  title: title.trim(),
                  startsAt: new Date(starts).toISOString(),
                  durationMin: /^\d+$/.test(duration) ? Number(duration) : 15,
                  ...ownerValue(owner),
                }),
              )
            }
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
            onClick={() => props.run(() => addDepAction({ eventId: props.eventId, itemId: row.id, dependsOnId: link }))}
          >
            {t('addDep')}
          </Button>
          {props.dependsOn.map((dep) => (
            <Button
              key={dep.dependsOnId}
              variant="ghost"
              disabled={props.pending}
              onClick={() =>
                props.run(() =>
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
