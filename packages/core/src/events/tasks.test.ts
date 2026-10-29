import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { toStoredPermissions } from './access.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { PRESETS } from '../auth/presets.js';
import { createEventDraft } from './commands.js';
import { createTask, listTasks, updateTask } from './tasks.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];

async function makeUser(name = 'Host'): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function join(eventId: string, actor: UserActor, preset: keyof typeof PRESETS) {
  await prisma.eventParticipant.create({
    data: { eventId, userId: actor.userId, role: 'CO_HOST', permissions: toStoredPermissions(PRESETS[preset]) },
  });
}

afterAll(async () => {
  const events = await prisma.event.findMany({ where: { createdById: { in: users } }, select: { id: true } });
  const ids = events.map((event) => event.id);
  await prisma.task.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ targetId: { in: ids } }, { actorId: { in: users } }] } });
  await prisma.event.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('tasks (UF-05)', () => {
  it('creates in a timeframe, completes (completedAt + audit) and reopens', async () => {
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    const { taskId } = await createTask(host, { eventId, title: 'Book DJ', timeframe: '8w' });
    await updateTask(host, { eventId, taskId, status: 'DONE' });
    let task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe('DONE');
    expect(task.completedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { targetId: taskId, action: 'task.complete' } })).toBe(1);
    await updateTask(host, { eventId, taskId, status: 'TODO' });
    task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.completedAt).toBeNull();
  });

  it('view-only members cannot create or edit; owners may update their own task status', async () => {
    const host = await makeUser();
    const viewer = await makeUser('Viewer');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    await join(eventId, viewer, 'view_only');
    const { taskId } = await createTask(host, { eventId, title: 'Order cake' });

    await expect(createTask(viewer, { eventId, title: 'Sneaky' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateTask(viewer, { eventId, taskId, status: 'DONE' })).rejects.toBeInstanceOf(ForbiddenError);

    await updateTask(host, { eventId, taskId, ownerUserId: viewer.userId });
    await updateTask(viewer, { eventId, taskId, status: 'IN_PROGRESS', notes: 'Called the baker' });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status).toBe('IN_PROGRESS');
    // ...but not other fields of it.
    await expect(updateTask(viewer, { eventId, taskId, title: 'Renamed' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('owners must be on the event; strangers get NOT_FOUND', async () => {
    const host = await makeUser();
    const stranger = await makeUser('Stranger');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    const { taskId } = await createTask(host, { eventId, title: 'Hire chairs' });
    await expect(updateTask(host, { eventId, taskId, ownerUserId: stranger.userId })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(updateTask(stranger, { eventId, taskId, status: 'DONE' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listTasks(stranger, eventId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists by due date with undated last and owner names', async () => {
    const host = await makeUser('Ada');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    await createTask(host, { eventId, title: 'Undated' });
    const { taskId } = await createTask(host, { eventId, title: 'Soon', dueAt: '2030-01-01T09:00:00Z' });
    await updateTask(host, { eventId, taskId, ownerUserId: host.userId });
    const tasks = await listTasks(host, eventId);
    expect(tasks.map((task) => task.title)).toEqual(['Soon', 'Undated']);
    expect(tasks[0]?.ownerName).toBe('Ada');
  });
});
