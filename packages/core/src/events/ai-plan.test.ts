import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { permissionsFor, toStoredPermissions } from './access.js';
import { addDraftedTasks, draftPlan, type PlanDraftContext, type PlanDrafter } from './ai-plan.js';
import { createTask, deleteTask } from './tasks.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
let eventId = '';
let host: UserActor;
let helper: UserActor;

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

/** Records what it was asked and returns a fixed draft, like the Fake LLM. */
function recordingDrafter() {
  const calls: PlanDraftContext[] = [];
  const drafter: PlanDrafter = {
    async draftTasks(context) {
      calls.push(context);
      return [
        { title: 'Book a garden venue', daysBefore: 60, why: 'Gardens book out early.' },
        { title: 'book a garden venue', daysBefore: 50, why: 'duplicate' },
        { title: 'Send save-the-dates', daysBefore: 45, why: 'Gives guests time.' },
        { title: 'Already planned', daysBefore: 10, why: 'exists' },
        { title: '   ', daysBefore: 1, why: 'empty' },
        { title: 'Confirm the DJ playlist', daysBefore: null, why: 'Any time.' },
      ];
    },
  };
  return { drafter, calls };
}

beforeAll(async () => {
  host = await makeUser('AiHost');
  helper = await makeUser('AiHelper');
  const event = await prisma.event.create({
    data: {
      slug: `ai-plan-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'ACTIVE',
      name: 'AI Party',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      startsAt: new Date('2030-06-01T15:00:00Z'),
      expectedGuests: 80,
      plannedBudgetMinor: 250_000_000n,
      createdById: host.userId,
    },
  });
  eventId = event.id;
  await prisma.eventParticipant.createMany({
    data: [
      { eventId, userId: host.userId, role: 'HOST', permissions: toStoredPermissions(permissionsFor('HOST')) },
      {
        eventId,
        userId: helper.userId,
        role: 'CO_HOST',
        permissions: toStoredPermissions({ ...permissionsFor('CO_HOST', 'view_only'), eventEdit: true }),
      },
    ],
  });
  await createTask(host, { eventId, title: 'Already planned' });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.task.deleteMany({ where: { eventId } });
  await prisma.eventParticipant.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('AI plan assistant (UF-27, AI-06)', () => {
  it('suggests clean, de-duplicated tasks with due dates and saves nothing (UF-27-1)', async () => {
    const { drafter, calls } = recordingDrafter();
    const now = new Date('2030-01-01T00:00:00Z');
    const { suggestions } = await draftPlan(drafter, host, { eventId, request: 'A relaxed garden party' }, now);

    expect(suggestions.map((row) => row.title)).toEqual([
      'Book a garden venue',
      'Send save-the-dates',
      'Confirm the DJ playlist',
    ]);
    expect(suggestions[0]?.dueAt).toBe(new Date('2030-04-02T15:00:00Z').toISOString()); // 60 days before
    expect(suggestions[2]?.dueAt).toBeNull();
    expect(calls[0]).toMatchObject({
      eventType: 'Birthday',
      expectedGuests: 80,
      budget: { amount: '2500000', currency: 'NGN' },
      existingTasks: ['Already planned'],
      request: 'A relaxed garden party',
    });
    expect(await prisma.task.count({ where: { eventId } })).toBe(1);
  });

  it('keeps money out of the prompt for someone without money permission (UF-27-2)', async () => {
    const { drafter, calls } = recordingDrafter();
    await draftPlan(drafter, helper, { eventId, request: 'Help me plan' });
    expect(calls[0]?.budget).toBeNull();
    expect(JSON.stringify(calls[0])).not.toContain('2500000');
  });

  it('adds only the picked suggestions, then the host can delete any task', async () => {
    const { added } = await addDraftedTasks(host, {
      eventId,
      tasks: [{ title: 'Send save-the-dates', dueAt: '2030-04-17T15:00:00.000Z', notes: 'Gives guests time.' }],
    });
    expect(added).toBe(1);
    const task = await prisma.task.findFirstOrThrow({ where: { eventId, title: 'Send save-the-dates' } });
    expect(task.notes).toBe('Gives guests time.');
    await deleteTask(host, { eventId, taskId: task.id });
    expect(await prisma.task.count({ where: { eventId, title: 'Send save-the-dates' } })).toBe(0);
  });
});
