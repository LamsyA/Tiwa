import { getEventType } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorize } from '../auth/authorize.js';
import { requireFlag } from '../flags/flags.js';
import { ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import { requireEventAccess } from './access.js';

// AI plan assistant (PRD AI-01, AI-06, UF-27; D-X31). The host describes what
// they want; an LLM proposes tasks; nothing is saved until the host picks
// suggestions and confirms (`addDraftedTasks`). Core never imports an LLM SDK:
// the web app passes a `PlanDrafter` (packages/ai) in, like `ImageScanner`.

type UserActor = Extract<Actor, { kind: 'user' }>;

/** Everything the model sees. No names, phones or emails; money only with `money.view` (UF-27-2). */
export interface PlanDraftContext {
  eventType: string;
  eventFormat: string;
  daysUntilEvent: number | null;
  expectedGuests: number | null;
  /** Planned budget in major units, or null when the asker may not see money. */
  budget: { amount: string; currency: string } | null;
  existingTasks: string[];
  request: string;
}

export interface PlanDraftSuggestion {
  title: string;
  /** Days before the event the task should be done; 0 = on the day; null = no date. */
  daysBefore: number | null;
  why: string;
}

export interface PlanDrafter {
  draftTasks(context: PlanDraftContext): Promise<PlanDraftSuggestion[]>;
}

export const draftPlanSchema = z.object({
  eventId: z.string().uuid(),
  request: z.string().trim().min(3, 'requestTooShort').max(1000, 'requestTooLong'),
});

const DAY_MS = 86_400_000;
const MAX_SUGGESTIONS = 25;

function canSeeMoney(actor: UserActor, eventId: string, access: Awaited<ReturnType<typeof requireEventAccess>>) {
  try {
    authorize(actor, 'money.view', { eventId, access });
    return true;
  } catch {
    return false;
  }
}

/** Ask the drafter for suggestions. Returns them with concrete due dates; saves nothing. */
export async function draftPlan(
  drafter: PlanDrafter,
  actor: UserActor,
  raw: z.input<typeof draftPlanSchema>,
  now = new Date(),
) {
  const input = draftPlanSchema.parse(raw);
  const access = await requireEventAccess(actor, input.eventId, 'event.edit');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    select: {
      type: true,
      format: true,
      countryCode: true,
      startsAt: true,
      expectedGuests: true,
      plannedBudgetMinor: true,
      currency: true,
    },
  });
  await requireFlag('ai.enabled', event.countryCode);
  const existing = await prisma.task.findMany({ where: { eventId: input.eventId }, select: { title: true } });
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency: event.currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;

  const context: PlanDraftContext = {
    eventType: getEventType(event.type)?.label ?? event.type,
    eventFormat: event.format,
    daysUntilEvent: event.startsAt
      ? Math.max(0, Math.round((event.startsAt.getTime() - now.getTime()) / DAY_MS))
      : null,
    expectedGuests: event.expectedGuests ?? null,
    budget:
      canSeeMoney(actor, input.eventId, access) && event.plannedBudgetMinor > 0n
        ? { amount: (Number(event.plannedBudgetMinor) / 10 ** digits).toFixed(0), currency: event.currency }
        : null,
    existingTasks: existing.map((row) => row.title).slice(0, 80),
    request: input.request,
  };

  const raw_suggestions = await drafter.draftTasks(context);
  const seen = new Set(existing.map((row) => row.title.trim().toLowerCase()));
  const suggestions = raw_suggestions
    .map((row) => ({
      title: String(row.title ?? '')
        .trim()
        .slice(0, 200),
      daysBefore:
        typeof row.daysBefore === 'number' && Number.isFinite(row.daysBefore)
          ? Math.max(0, Math.min(730, Math.round(row.daysBefore)))
          : null,
      why: String(row.why ?? '')
        .trim()
        .slice(0, 300),
    }))
    .filter((row) => row.title.length > 0 && !seen.has(row.title.toLowerCase()) && seen.add(row.title.toLowerCase()))
    .slice(0, MAX_SUGGESTIONS)
    .map((row) => ({
      ...row,
      dueAt:
        row.daysBefore !== null && event.startsAt
          ? new Date(Math.max(now.getTime(), event.startsAt.getTime() - row.daysBefore * DAY_MS)).toISOString()
          : null,
    }));
  return { suggestions };
}

export const addDraftedTasksSchema = z.object({
  eventId: z.string().uuid(),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'titleRequired').max(200, 'titleTooLong'),
        dueAt: z.string().datetime({ offset: true }).nullable(),
        notes: z.string().max(300).nullable().optional(),
      }),
    )
    .min(1)
    .max(MAX_SUGGESTIONS),
});

/** AI-06: the host confirmed these suggestions; save exactly what they picked. */
export async function addDraftedTasks(actor: UserActor, raw: z.input<typeof addDraftedTasksSchema>) {
  const input = addDraftedTasksSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const offset = await prisma.task.count({ where: { eventId: input.eventId } });
  if (offset + input.tasks.length > 500) throw new ValidationError('Too many tasks', { key: 'tooManyTasks' });
  await prisma.$transaction(async (tx) => {
    await tx.task.createMany({
      data: input.tasks.map((task, index) => ({
        eventId: input.eventId,
        title: task.title,
        notes: task.notes ?? null,
        dueAt: task.dueAt ? new Date(task.dueAt) : null,
        sortOrder: offset + index,
      })),
    });
    await audit(tx, {
      actor,
      action: 'event.tasks.ai',
      targetType: 'Event',
      targetId: input.eventId,
      data: { added: input.tasks.length },
    });
  });
  return { added: input.tasks.length };
}
