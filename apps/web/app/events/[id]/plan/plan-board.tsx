'use client';

import { TIMEFRAMES } from '@tiwa/config/event-types';
import {
  Banner,
  Button,
  Checkbox,
  DateField,
  FieldShell,
  Input,
  ProgressBar,
  ResponsiveDialog,
  Select,
  StatusPill,
  Textarea,
  cn,
} from '@tiwa/ui';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useLive } from '@/hooks/use-live.js';
import type { ActionResult } from '@/lib/action.js';
import { addTask, editTask } from './actions.js';

type Status = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
type Priority = 'LOW' | 'NORMAL' | 'HIGH';
type Filter = 'all' | 'mine' | 'overdue' | 'blocked';

export interface PlanTask {
  id: string;
  title: string;
  notes: string | null;
  timeframe: string | null;
  dueAt: string | null;
  status: Status;
  priority: Priority;
  ownerUserId: string | null;
  ownerName: string | null;
}

const GROUPS = [...TIMEFRAMES, 'none'] as const;
type Group = (typeof GROUPS)[number];
const DAY_MS = 86_400_000;

function groupOf(task: PlanTask): Group {
  return (TIMEFRAMES as readonly string[]).includes(task.timeframe ?? '') ? (task.timeframe as Group) : 'none';
}

/** Whole days a task is late (0 when not overdue). */
function daysOverdue(task: PlanTask, now: number): number {
  if (!task.dueAt || task.status === 'DONE') return 0;
  const late = now - new Date(task.dueAt).getTime();
  return late > 0 ? Math.max(1, Math.floor(late / DAY_MS)) : 0;
}

function dateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

export function PlanBoard({
  eventId,
  me,
  timezone,
  canEdit,
  tasks: serverTasks,
  members,
}: {
  eventId: string;
  me: string;
  timezone: string;
  canEdit: boolean;
  tasks: PlanTask[];
  members: { userId: string; name: string | null }[];
}) {
  const t = useTranslations('events.plan');
  const router = useRouter();
  const [tasks, setTasks] = React.useState(serverTasks);
  const [filter, setFilter] = React.useState<Filter>('all');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());

  // Server data wins whenever it changes (after a refresh or a live notice).
  const [synced, setSynced] = React.useState(serverTasks);
  if (synced !== serverTasks) {
    setSynced(serverTasks);
    setTasks(serverTasks);
  }
  useLive(`/api/sse/event/${eventId}`, () => router.refresh());

  const done = tasks.filter((task) => task.status === 'DONE').length;
  const visible = tasks.filter((task) => {
    if (filter === 'mine') return task.ownerUserId === me;
    if (filter === 'overdue') return daysOverdue(task, now) > 0;
    if (filter === 'blocked') return task.status === 'BLOCKED';
    return true;
  });
  const open = tasks.find((task) => task.id === openId) ?? null;

  /** Optimistic toggle (UF-05-1): the list and progress update at once; failure rolls back. */
  async function toggle(task: PlanTask) {
    const next: Status = task.status === 'DONE' ? 'TODO' : 'DONE';
    setError(null);
    setTasks((current) => current.map((row) => (row.id === task.id ? { ...row, status: next } : row)));
    const result = await editTask({ eventId, taskId: task.id, status: next });
    if (!result.ok) {
      setTasks((current) => current.map((row) => (row.id === task.id ? { ...row, status: task.status } : row)));
      setError(result.code === 'FORBIDDEN' ? t('errors.FORBIDDEN') : t('errors.generic'));
    } else router.refresh();
  }

  const filters: [Filter, string][] = [
    ['all', t('filterAll')],
    ['mine', t('filterMine')],
    ['overdue', t('filterOverdue')],
    ['blocked', t('filterBlocked')],
  ];

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-2">
        <ProgressBar
          value={done}
          max={Math.max(tasks.length, 1)}
          label={t('progress', { done, total: tasks.length })}
        />
        <p className="text-muted text-sm" data-testid="plan-progress">
          {t('progress', { done, total: tasks.length })}
        </p>
      </div>
      {!canEdit && <Banner tone="info">{t('readOnly')}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      <div role="group" aria-label={t('filters')} className="flex flex-wrap gap-2">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              'focus-visible:outline-focus h-9 rounded-full border px-3 text-sm font-medium focus-visible:outline-2',
              filter === key ? 'border-brand-strong bg-brand-soft text-text' : 'border-border bg-surface text-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tasks.length === 0 && !canEdit && <p className="text-muted">{t('emptyAll')}</p>}
      {tasks.length > 0 && visible.length === 0 && <p className="text-muted">{t('empty')}</p>}

      {GROUPS.map((group) => {
        const inGroup = visible.filter((task) => groupOf(task) === group);
        const showEmptyGroupForAdd = canEdit && filter === 'all' && group !== 'none';
        if (inGroup.length === 0 && !showEmptyGroupForAdd) return null;
        const label = t(`timeframes.${group}`);
        return (
          <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-2">
            <h3 id={`group-${group}`} className="text-muted text-sm font-medium uppercase tracking-wide">
              {label}
            </h3>
            {canEdit && filter === 'all' && (
              <AddTask eventId={eventId} group={group} groupLabel={label} onError={setError} />
            )}
            {inGroup.length > 0 && (
              <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
                {inGroup.map((task) => {
                  const late = daysOverdue(task, now);
                  return (
                    <li key={task.id} className="flex items-center gap-3 px-3 py-2">
                      <Checkbox
                        checked={task.status === 'DONE'}
                        disabled={!canEdit && task.ownerUserId !== me}
                        aria-label={
                          task.status === 'DONE'
                            ? t('reopen', { title: task.title })
                            : t('complete', { title: task.title })
                        }
                        onCheckedChange={() => void toggle(task)}
                      />
                      <button
                        type="button"
                        onClick={() => setOpenId(task.id)}
                        className="focus-visible:outline-focus flex min-h-11 min-w-0 flex-1 flex-col items-start text-left focus-visible:outline-2"
                      >
                        <span className={cn('truncate', task.status === 'DONE' && 'text-muted line-through')}>
                          {task.title}
                        </span>
                        <span className="flex flex-wrap gap-x-2 text-sm">
                          {late > 0 ? (
                            <span className="text-danger font-medium">{t('overdueDays', { days: late })}</span>
                          ) : (
                            task.dueAt &&
                            task.status !== 'DONE' && (
                              <span className="text-muted">
                                {t('dueOn', { date: dateInZone(task.dueAt, timezone) })}
                              </span>
                            )
                          )}
                          {task.ownerName && <span className="text-muted">· {task.ownerName}</span>}
                        </span>
                      </button>
                      {(task.status === 'BLOCKED' || task.status === 'IN_PROGRESS') && (
                        <StatusPill tone={task.status === 'BLOCKED' ? 'danger' : 'brand'}>
                          {t(`status.${task.status}`)}
                        </StatusPill>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {open && (
        <TaskDetail
          key={open.id}
          eventId={eventId}
          task={open}
          timezone={timezone}
          members={members}
          canEdit={canEdit}
          isOwner={open.ownerUserId === me}
          onClose={() => setOpenId(null)}
          onSaved={(patch) => {
            setTasks((current) => current.map((row) => (row.id === open.id ? { ...row, ...patch } : row)));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AddTask({
  eventId,
  group,
  groupLabel,
  onError,
}: {
  eventId: string;
  group: Group;
  groupLabel: string;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('events.plan');
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    onError(null);
    try {
      const result = await addTask({ eventId, title, timeframe: group === 'none' ? null : group });
      if (result.ok) {
        setTitle('');
        router.refresh();
      } else onError(t('errors.generic'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input
        aria-label={t('addTaskIn', { group: groupLabel })}
        placeholder={t('newTaskPlaceholder')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button type="submit" variant="secondary" loading={saving} aria-label={t('addTaskIn', { group: groupLabel })}>
        <Plus aria-hidden className="size-5" />
        <span className="hidden sm:inline">{t('addTask')}</span>
      </Button>
    </form>
  );
}

function TaskDetail({
  eventId,
  task,
  timezone,
  members,
  canEdit,
  isOwner,
  onClose,
  onSaved,
}: {
  eventId: string;
  task: PlanTask;
  timezone: string;
  members: { userId: string; name: string | null }[];
  canEdit: boolean;
  isOwner: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<PlanTask>) => void;
}) {
  const t = useTranslations('events.plan');
  const [title, setTitle] = React.useState(task.title);
  const [notes, setNotes] = React.useState(task.notes ?? '');
  const [status, setStatus] = React.useState<Status>(task.status);
  const [priority, setPriority] = React.useState<Priority>(task.priority);
  const [owner, setOwner] = React.useState(task.ownerUserId ?? '');
  const [due, setDue] = React.useState(task.dueAt ? dateInZone(task.dueAt, timezone) : '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const editable = canEdit || isOwner;

  async function save() {
    setSaving(true);
    setError(null);
    // Due dates are whole days: store noon UTC so every timezone shows the same date.
    const dueAt = due ? `${due}T12:00:00.000Z` : null;
    const ownerFields = { status, notes: notes || null, dueAt };
    const result: ActionResult<unknown> = await editTask({
      eventId,
      taskId: task.id,
      ...ownerFields,
      ...(canEdit ? { title, priority, ownerUserId: owner || null } : {}),
    });
    setSaving(false);
    if (result.ok) {
      onSaved({
        ...ownerFields,
        ...(canEdit
          ? {
              title,
              priority,
              ownerUserId: owner || null,
              ownerName: members.find((member) => member.userId === owner)?.name ?? null,
            }
          : {}),
      });
      onClose();
    } else {
      const key = result.fieldErrors ? Object.values(result.fieldErrors).flat()[0] : result.code;
      setError(key && t.has(`errors.${key}`) ? t(`errors.${key}`) : t('errors.generic'));
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('detailTitle')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
          {editable && (
            <Button loading={saving} onClick={() => void save()}>
              {t('save')}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        <FieldShell id="task-title" label={t('titleLabel')}>
          {(describedBy) => (
            <Input
              id="task-title"
              aria-describedby={describedBy}
              disabled={!canEdit}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </FieldShell>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('statusLabel')}
            disabled={!editable}
            value={status}
            options={(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const).map((value) => ({
              value,
              label: t(`status.${value}`),
            }))}
            onValueChange={(value) => setStatus(value as Status)}
          />
          <Select
            label={t('priorityLabel')}
            disabled={!canEdit}
            value={priority}
            options={(['LOW', 'NORMAL', 'HIGH'] as const).map((value) => ({ value, label: t(`priority.${value}`) }))}
            onValueChange={(value) => setPriority(value as Priority)}
          />
          <Select
            label={t('ownerLabel')}
            disabled={!canEdit}
            value={owner}
            options={[
              { value: '', label: t('noOwner') },
              ...members.map((member) => ({ value: member.userId, label: member.name ?? member.userId.slice(0, 8) })),
            ]}
            onValueChange={setOwner}
          />
          <FieldShell id="task-due" label={t('dueLabel')}>
            {(describedBy) => (
              <DateField
                id="task-due"
                aria-describedby={describedBy}
                disabled={!editable}
                value={due}
                onValueChange={setDue}
              />
            )}
          </FieldShell>
        </div>
        <FieldShell id="task-notes" label={t('notesLabel')}>
          {(describedBy) => (
            <Textarea
              id="task-notes"
              aria-describedby={describedBy}
              disabled={!editable}
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          )}
        </FieldShell>
      </div>
    </ResponsiveDialog>
  );
}
