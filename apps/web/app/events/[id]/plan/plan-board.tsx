'use client';

import {
  Banner,
  Button,
  Checkbox,
  DateField,
  FieldShell,
  Input,
  ResponsiveDialog,
  Select,
  Textarea,
  cn,
} from '@tiwa/ui';
import { CalendarDays, Check, ChevronRight, Flag, Loader2, Pencil, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useFlag } from '@/components/flags.js';
import { useLive } from '@/hooks/use-live.js';
import type { ActionResult } from '@/lib/action.js';
import { addDraftedTasksAction, addTask, draftPlanAction, editTask, removeTask } from './actions.js';

type Status = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
type Priority = 'LOW' | 'NORMAL' | 'HIGH';
type Filter = 'all' | 'todo' | 'done' | 'missed';

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

const DAY_MS = 86_400_000;

const STATUS_TONE: Record<Status, string> = {
  TODO: 'bg-surface-2 text-muted',
  IN_PROGRESS: 'bg-teal-soft text-teal-strong',
  DONE: 'bg-success-soft text-success',
  BLOCKED: 'bg-warning-soft text-warning',
};
const PRIORITY_TONE: Record<Priority, string> = {
  LOW: 'bg-surface-2 text-muted',
  NORMAL: 'bg-surface-2 text-muted',
  HIGH: 'bg-danger-soft text-danger',
};

/** Missed = has a due date that has passed and is not done (D-X31). */
function isMissed(task: PlanTask, now: number): boolean {
  return task.status !== 'DONE' && task.dueAt !== null && new Date(task.dueAt).getTime() < now - DAY_MS / 2;
}

function dateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

function shortDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone, day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** Done first-class: missed, then dated soonest, then undated, then done at the bottom. */
function sortTasks(tasks: PlanTask[], now: number): PlanTask[] {
  const rank = (task: PlanTask) => (task.status === 'DONE' ? 3 : isMissed(task, now) ? 0 : task.dueAt ? 1 : 2);
  return [...tasks].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return aDue - bDue;
  });
}

function ProgressRing({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative grid size-20 shrink-0 place-items-center sm:size-24">
      <div
        aria-hidden
        className="absolute inset-3 rounded-full blur-2xl transition-opacity duration-700"
        style={{ background: 'color-mix(in oklab, var(--brand) 35%, transparent)', opacity: pct > 0 ? 0.7 : 0.25 }}
      />
      <svg viewBox="0 0 100 100" className="relative size-20 -rotate-90 sm:size-24" aria-hidden>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="url(#tiwa-ring)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 700ms var(--ease-out)' }}
        />
        <defs>
          <linearGradient id="tiwa-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute flex flex-col items-center">
        <span className="font-display text-xl font-bold tracking-tight">{pct}%</span>
      </span>
    </div>
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
  const aiOn = useFlag('ai.enabled');
  const [tasks, setTasks] = React.useState(serverTasks);
  const [filter, setFilter] = React.useState<Filter>('all');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [aiOpen, setAiOpen] = React.useState(false);
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
  const missed = tasks.filter((task) => isMissed(task, now)).length;
  const left = tasks.length - done;
  const visible = sortTasks(
    tasks.filter((task) => {
      if (filter === 'todo') return task.status !== 'DONE';
      if (filter === 'done') return task.status === 'DONE';
      if (filter === 'missed') return isMissed(task, now);
      return true;
    }),
    now,
  );

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

  async function remove(task: PlanTask) {
    setError(null);
    setTasks((current) => current.filter((row) => row.id !== task.id));
    const result = await removeTask({ eventId, taskId: task.id });
    if (!result.ok) {
      setTasks((current) => [...current, task]);
      setError(t('errors.generic'));
    } else router.refresh();
  }

  const filters: [Filter, string, number][] = [
    ['all', t('filterAll'), tasks.length],
    ['todo', t('filterTodo'), left],
    ['done', t('filterDone'), done],
    ['missed', t('filterMissed'), missed],
  ];

  return (
    <div className="flex flex-col gap-5 py-2">
      {/* Summary */}
      <section
        aria-label={t('summaryLabel')}
        className="border-border/80 bg-bg tiwa-fade-up relative overflow-hidden rounded-2xl border p-4 sm:p-5"
      >
        <div className="flex items-center gap-4 sm:gap-6">
          <ProgressRing value={done} total={tasks.length} />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <h3 className="font-display text-lg font-bold tracking-tight sm:text-xl">
                {tasks.length === 0 ? t('emptyTitle') : left === 0 ? t('allDoneTitle') : t('progressTitle')}
              </h3>
              <p className="text-muted text-sm" data-testid="plan-progress">
                {t('progress', { done, total: tasks.length })}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              {(
                [
                  ['statDone', done, 'text-success'],
                  ['statLeft', left, 'text-text'],
                  ['statMissed', missed, missed > 0 ? 'text-danger' : 'text-text'],
                ] as const
              ).map(([key, value, tone]) => (
                <div key={key} className="bg-surface rounded-xl px-2.5 py-1.5">
                  <dt className="text-muted text-[11px] font-medium">{t(key)}</dt>
                  <dd className={cn('font-display text-lg font-bold', tone)}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        {canEdit && aiOn && (
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="tiwa-ai-glow from-brand-strong to-brand group mt-4 flex w-full items-center gap-3 rounded-xl bg-gradient-to-r px-3.5 py-2.5 text-left text-white transition-transform hover:-translate-y-0.5"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{t('aiCta')}</span>
              <span className="block text-sm text-white/80">{t('aiCtaBody')}</span>
            </span>
            <ChevronRight className="size-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </button>
        )}
      </section>

      {!canEdit && <Banner tone="info">{t('readOnly')}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}
      {missed > 0 && filter !== 'missed' && (
        <button
          type="button"
          onClick={() => setFilter('missed')}
          className="bg-danger-soft text-danger tiwa-fade-up flex items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium"
        >
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{t('missedBanner', { count: missed })}</span>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      )}

      {canEdit && <QuickAdd eventId={eventId} onError={setError} />}

      <div role="group" aria-label={t('filters')} className="scrollbar-none flex gap-2 overflow-x-auto">
        {filters.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors',
              filter === key ? 'bg-text text-bg' : 'bg-surface text-muted hover:text-text',
            )}
          >
            {label}
            <span
              className={cn(
                'rounded-full px-1.5 text-xs',
                filter === key ? 'bg-bg/20' : key === 'missed' && count > 0 ? 'bg-danger-soft text-danger' : 'bg-bg',
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-muted px-1 py-6 text-center">{tasks.length === 0 ? t('emptyBody') : t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((task, index) => {
            const late = isMissed(task, now);
            const isDone = task.status === 'DONE';
            return (
              <li
                key={task.id}
                style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
                className={cn(
                  'group border-border/70 bg-surface tiwa-fade-up flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 shadow-[var(--shadow-1)] transition-all hover:shadow-[var(--shadow-2)] sm:gap-3 sm:px-4',
                  late && 'border-danger/30',
                  isDone && 'bg-surface/60',
                )}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  disabled={!canEdit && task.ownerUserId !== me}
                  aria-label={isDone ? t('markNotDone', { title: task.title }) : t('markDone', { title: task.title })}
                  onClick={() => void toggle(task)}
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors disabled:opacity-50',
                    isDone
                      ? 'border-success bg-success text-white'
                      : late
                        ? 'border-danger/60 hover:bg-danger-soft'
                        : 'border-border hover:border-brand-strong',
                  )}
                >
                  {isDone && <Check className="tiwa-pop size-4" strokeWidth={3} aria-hidden />}
                </button>
                <button
                  type="button"
                  aria-label={task.title}
                  onClick={() => setOpenId(task.id)}
                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                >
                  <span
                    className={cn(
                      'w-full truncate text-sm font-semibold transition-colors sm:text-[15px]',
                      isDone && 'text-muted line-through',
                    )}
                  >
                    {task.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                    <span className={cn('rounded-full px-2 py-0.5', STATUS_TONE[task.status])}>
                      {t(`status.${task.status}`)}
                    </span>
                    {task.priority !== 'NORMAL' && (
                      <span
                        className={cn('flex items-center gap-1 rounded-full px-2 py-0.5', PRIORITY_TONE[task.priority])}
                      >
                        <Flag className="size-3" aria-hidden />
                        {t(`priority.${task.priority}`)}
                      </span>
                    )}
                    {task.dueAt && !isDone && (
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded-full px-2 py-0.5',
                          late ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-muted',
                        )}
                      >
                        <CalendarDays className="size-3" aria-hidden />
                        {late
                          ? t('missedOn', { date: shortDate(task.dueAt, timezone) })
                          : shortDate(task.dueAt, timezone)}
                      </span>
                    )}
                    {task.ownerName && (
                      <span className="bg-surface-2 text-muted flex max-w-[10rem] items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5">
                        <span className="bg-teal-soft text-teal-strong grid size-4 place-items-center rounded-full text-[9px] font-bold">
                          {task.ownerName.trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate">{task.ownerName}</span>
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t('editTask', { title: task.title })}
                  onClick={() => setOpenId(task.id)}
                  className="text-muted hover:text-text hover:bg-surface-2 grid size-8 shrink-0 place-items-center rounded-lg transition"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={t('deleteTask', { title: task.title })}
                    onClick={() => void remove(task)}
                    className="text-muted hover:text-danger hover:bg-danger-soft grid size-8 shrink-0 place-items-center rounded-lg opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {open(tasks, openId) && (
        <TaskDetail
          key={openId}
          eventId={eventId}
          task={open(tasks, openId)!}
          timezone={timezone}
          members={members}
          canEdit={canEdit}
          isOwner={open(tasks, openId)!.ownerUserId === me}
          onClose={() => setOpenId(null)}
          onSaved={(patch) => {
            setTasks((current) => current.map((row) => (row.id === openId ? { ...row, ...patch } : row)));
            router.refresh();
          }}
        />
      )}
      {aiOpen && <AiPlanner eventId={eventId} timezone={timezone} onClose={() => setAiOpen(false)} />}
    </div>
  );
}

function open(tasks: PlanTask[], id: string | null): PlanTask | null {
  return tasks.find((task) => task.id === id) ?? null;
}

/** One line to add a task, with an optional date. Enter submits. */
function QuickAdd({ eventId, onError }: { eventId: string; onError: (message: string | null) => void }) {
  const t = useTranslations('events.plan');
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [due, setDue] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    onError(null);
    const result = await addTask({ eventId, title: title.trim(), dueAt: due ? `${due}T12:00:00.000Z` : null });
    setSaving(false);
    if (!result.ok) {
      const key = result.fieldErrors ? Object.values(result.fieldErrors).flat()[0] : result.code;
      onError(key && t.has(`errors.${key}`) ? t(`errors.${key}`) : t('errors.generic'));
      return;
    }
    setTitle('');
    setDue('');
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="border-border/80 bg-bg focus-within:border-brand-strong focus-within:ring-brand-strong/15 flex items-center gap-2 rounded-2xl border p-1.5 pl-4 transition-[box-shadow,border-color] focus-within:ring-4"
    >
      <Plus className="text-muted size-5 shrink-0" aria-hidden />
      <input
        aria-label={t('addTask')}
        placeholder={t('quickAddPlaceholder')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="placeholder:text-muted h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
      />
      <input
        type="date"
        aria-label={t('dueLabel')}
        value={due}
        onChange={(event) => setDue(event.target.value)}
        className="text-muted bg-surface hidden h-10 rounded-xl px-3 text-sm outline-none sm:block"
      />
      <Button type="submit" loading={saving} disabled={!title.trim()} className="shrink-0 rounded-xl">
        {t('addTask')}
      </Button>
    </form>
  );
}

interface Draft {
  title: string;
  why: string;
  dueAt: string | null;
}

/**
 * D-X95: what the host sees while the AI works (it can take 10–60 s): a live
 * badge, the step it is on, a progress bar that eases toward the end, the
 * seconds so far, reassurance after 20 s, and a way to stop.
 */
function AiWorking({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations('events.plan');
  const steps = [t('aiStep1'), t('aiStep2'), t('aiStep3'), t('aiStep4'), t('aiStep5')];
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const step = Math.min(steps.length - 1, Math.floor(seconds / 4));
  // Eases toward 92% so it never looks finished before it is.
  const progress = Math.round(92 * (1 - Math.exp(-seconds / 14)));
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-brand/20 from-brand-soft/60 to-surface relative overflow-hidden rounded-3xl border bg-gradient-to-br p-5"
    >
      <div className="flex items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center">
          <span className="bg-brand/25 absolute inset-0 animate-ping rounded-full" />
          <span className="bg-brand relative grid size-11 place-items-center rounded-full text-white shadow-[var(--shadow-2)]">
            <Wand2 className="size-5 animate-pulse" aria-hidden />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold">{t('aiThinking')}</p>
          <p key={step} className="text-muted tiwa-fade-up text-sm">
            {steps[step]}
          </p>
        </div>
        <span className="text-muted shrink-0 text-xs tabular-nums">{t('aiSeconds', { seconds })}</span>
      </div>
      <div className="bg-surface-2 mt-4 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-brand h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{ width: `${Math.max(6, progress)}%` }}
        />
      </div>
      <ol className="mt-4 flex flex-col gap-1.5">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`flex items-center gap-2 text-sm transition ${index > step ? 'text-muted/60' : index === step ? 'font-medium' : 'text-muted'}`}
          >
            {index < step ? (
              <Check className="text-success size-4" aria-hidden />
            ) : index === step ? (
              <Loader2 className="text-brand size-4 animate-spin" aria-hidden />
            ) : (
              <span className="border-border size-4 rounded-full border" aria-hidden />
            )}
            {label}
          </li>
        ))}
      </ol>
      {seconds >= 20 && <p className="text-muted tiwa-fade-up mt-3 text-xs">{t('aiSlow')}</p>}
      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('aiCancel')}
        </Button>
      </div>
    </div>
  );
}

/** Describe the event → AI drafts tasks → pick → add (AI-06: nothing saved until "Add"). */
function AiPlanner({ eventId, timezone, onClose }: { eventId: string; timezone: string; onClose: () => void }) {
  const t = useTranslations('events.plan');
  const router = useRouter();
  const [request, setRequest] = React.useState('');
  const [drafts, setDrafts] = React.useState<Draft[] | null>(null);
  const [picked, setPicked] = React.useState<Set<number>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ideas = [t('aiIdea1'), t('aiIdea2'), t('aiIdea3')];
  // D-X95: a cancelled draft's late answer is ignored.
  const run = React.useRef(0);

  async function draft() {
    const mine = ++run.current;
    setLoading(true);
    setError(null);
    const result = await draftPlanAction({ eventId, request }).catch(() => null);
    if (mine !== run.current) return;
    setLoading(false);
    if (!result) return setError(t('errors.aiFailed'));
    if (!result.ok) {
      const key = result.fieldErrors ? Object.values(result.fieldErrors).flat()[0] : result.code;
      return setError(key && t.has(`errors.${key}`) ? t(`errors.${key}`) : t('errors.aiFailed'));
    }
    setDrafts(result.data.suggestions);
    setPicked(new Set(result.data.suggestions.map((_, index) => index)));
  }

  async function add() {
    if (!drafts) return;
    setAdding(true);
    const tasks = drafts
      .filter((_, index) => picked.has(index))
      .map((row) => ({ title: row.title, dueAt: row.dueAt, notes: row.why || null }));
    const result = await addDraftedTasksAction({ eventId, tasks });
    setAdding(false);
    if (!result.ok) return setError(t('errors.generic'));
    onClose();
    router.refresh();
  }

  return (
    <ResponsiveDialog open onOpenChange={(next) => !next && onClose()} title={t('aiTitle')} description={t('aiBody')}>
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        {drafts === null ? (
          <>
            <div className="tiwa-ai-glow rounded-2xl">
              <Textarea
                autoFocus
                rows={4}
                disabled={loading}
                value={request}
                placeholder={t('aiPlaceholder')}
                onChange={(event) => setRequest(event.target.value)}
                className="rounded-2xl border-transparent focus:ring-0"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {ideas.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  disabled={loading}
                  onClick={() => setRequest(idea)}
                  className="bg-surface text-muted hover:text-text rounded-full px-3 py-1.5 text-left text-xs font-medium transition-colors"
                >
                  {idea}
                </button>
              ))}
            </div>
            {loading ? (
              <AiWorking
                onCancel={() => {
                  run.current += 1;
                  setLoading(false);
                }}
              />
            ) : (
              <Button disabled={request.trim().length < 3} onClick={() => void draft()}>
                <Sparkles className="size-4" aria-hidden />
                {t('aiDraft')}
              </Button>
            )}
          </>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-muted">{t('aiNothing')}</p>
            <Button variant="secondary" onClick={() => setDrafts(null)}>
              {t('aiTryAgain')}
            </Button>
          </div>
        ) : (
          <>
            <ul className="border-border/80 divide-border/70 max-h-[50vh] divide-y overflow-y-auto rounded-2xl border">
              {drafts.map((row, index) => (
                <li
                  key={`${row.title}-${index}`}
                  className="tiwa-fade-up"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                    <Checkbox
                      className="mt-0.5"
                      checked={picked.has(index)}
                      onCheckedChange={(checked) =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(index);
                          else next.delete(index);
                          return next;
                        })
                      }
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-medium">{row.title}</span>
                      {row.why && <span className="text-muted text-sm">{row.why}</span>}
                    </span>
                    {row.dueAt && (
                      <span className="text-muted bg-surface shrink-0 rounded-full px-2 py-0.5 text-xs">
                        {shortDate(row.dueAt, timezone)}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDrafts(null)}>
                {t('aiRefine')}
              </Button>
              <Button className="flex-1" disabled={adding || picked.size === 0} onClick={() => void add()}>
                {adding ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('aiAdding')}
                  </>
                ) : (
                  t('addSelected', { count: picked.size })
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </ResponsiveDialog>
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
