import { TIMEFRAMES } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize, type Actor } from '../auth/authorize.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import { loadEventAccess, requireEventAccess } from './access.js';

// Tasks (EVT-03, UF-05). Members with `event.edit` manage every task; a task's
// owner may update their own task's status, notes and due date (Backend.md §6).

type UserActor = Extract<Actor, { kind: 'user' }>;

const STATUS = z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']);
const PRIORITY = z.enum(['LOW', 'NORMAL', 'HIGH']);
const DUE = z.string().datetime({ offset: true }).nullable();

export const createTaskSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().trim().min(1, 'titleRequired').max(200, 'titleTooLong'),
  timeframe: z.enum(TIMEFRAMES).nullable().optional(),
  dueAt: DUE.optional(),
});

export const updateTaskSchema = z.object({
  eventId: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string().trim().min(1, 'titleRequired').max(200, 'titleTooLong').optional(),
  notes: z.string().max(4000, 'notesTooLong').nullable().optional(),
  status: STATUS.optional(),
  priority: PRIORITY.optional(),
  dueAt: DUE.optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
});

/** Fields a task owner without `event.edit` may change on their own task. */
const OWNER_FIELDS = new Set(['eventId', 'taskId', 'status', 'notes', 'dueAt']);

export async function createTask(actor: UserActor, input: z.infer<typeof createTaskSchema>) {
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const last = await prisma.task.findFirst({
    where: { eventId: input.eventId, timeframe: input.timeframe ?? null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const task = await prisma.task.create({
    data: {
      eventId: input.eventId,
      title: input.title,
      timeframe: input.timeframe ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
  return { taskId: task.id };
}

export async function updateTask(actor: UserActor, input: z.infer<typeof updateTaskSchema>) {
  const access = await loadEventAccess(actor.userId, input.eventId);
  if (!access) throw new NotFoundError('Event not found');
  const task = await prisma.task.findFirst({ where: { id: input.taskId, eventId: input.eventId } });
  if (!task) throw new NotFoundError('Task not found');

  let canEdit = true;
  try {
    authorize(actor, 'event.edit', { eventId: input.eventId, access });
  } catch (error) {
    canEdit = false;
    const ownsTask = task.ownerUserId === actor.userId;
    const ownerFieldsOnly = Object.keys(input).every((key) => OWNER_FIELDS.has(key));
    if (!ownsTask || !ownerFieldsOnly) throw error;
  }

  if (input.ownerUserId) {
    const owner = await loadEventAccess(input.ownerUserId, input.eventId);
    if (!owner)
      throw new ValidationError('Owner must be on the event', { field: 'ownerUserId', key: 'ownerNotMember' });
  }

  const completing = input.status === 'DONE' && task.status !== 'DONE';
  const reopening = input.status !== undefined && input.status !== 'DONE' && task.status === 'DONE';
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.task.update({
      where: { id: task.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
        ...(input.ownerUserId !== undefined && canEdit ? { ownerUserId: input.ownerUserId } : {}),
        ...(completing ? { completedAt: new Date() } : reopening ? { completedAt: null } : {}),
      },
      select: { id: true, status: true },
    });
    if (completing || reopening) {
      await audit(tx, {
        actor,
        action: completing ? 'task.complete' : 'task.reopen',
        targetType: 'Task',
        targetId: task.id,
        data: { eventId: input.eventId },
      });
    }
    return row;
  });
  return updated;
}

export interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  timeframe: string | null;
  dueAt: Date | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  ownerUserId: string | null;
  ownerName: string | null;
}

export async function listTasks(actor: UserActor, eventId: string): Promise<TaskRow[]> {
  await requireEventAccess(actor, eventId, 'event.view');
  const rows = await prisma.task.findMany({
    where: { eventId },
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
    include: { owner: { select: { name: true, phone: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    notes: row.notes,
    timeframe: row.timeframe,
    dueAt: row.dueAt,
    status: row.status,
    priority: row.priority,
    ownerUserId: row.ownerUserId,
    ownerName: row.owner && row.owner.name !== row.owner.phone ? row.owner.name || null : null,
  }));
}
