import { cancelEvent, createEventDraft, createTask, findDeadlineAlerts, updateTask } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { handleDeadlineAlerts } from './deadline-alerts.js';

const users: string[] = [];
const mine: string[] = [];

const logged: unknown[] = [];
const fakeLog = { info: (obj: unknown) => void logged.push(obj) } as unknown as Parameters<
  typeof handleDeadlineAlerts
>[0];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

function iso(offsetMs: number, base = Date.now()): string {
  return new Date(base + offsetMs).toISOString();
}

afterAll(async () => {
  await prisma.task.deleteMany({ where: { eventId: { in: mine } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: mine } } });
  await prisma.outboxEvent.deleteMany({
    where: { OR: mine.map((id) => ({ payload: { path: ['eventId'], equals: id } })) },
  });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ targetId: { in: mine } }, { actorId: { in: users } }] },
  });
  await prisma.event.deleteMany({ where: { id: { in: mine } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

/** The shared dev DB holds other tasks; only assert on this test's events. */
async function myAlerts(now: Date) {
  return (await findDeadlineAlerts(now)).filter((alert) => mine.includes(alert.eventId));
}

describe('events/deadline-alerts', () => {
  it('finds due-soon and overdue, skipping done, undated, distant and closed events', async () => {
    const host = await makeHost();
    // Year 2000: the shared dev DB holds thousands of stale dated tasks (e2e runs);
    // dating the fixture in the past keeps them outside the scan window by query
    // construction, so the take-500 cap can't cut off our own rows.
    const now = new Date('2000-05-01T12:00:00Z');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    mine.push(eventId);

    const overdue = await createTask(host, { eventId, title: 'Overdue', dueAt: iso(-60_000, now.getTime()) });
    const soon = await createTask(host, { eventId, title: 'Soon', dueAt: iso(60 * 60 * 1000, now.getTime()) });
    // Noise the scan must ignore:
    await createTask(host, { eventId, title: 'Later', dueAt: iso(48 * 60 * 60 * 1000, now.getTime()) });
    await createTask(host, { eventId, title: 'Undated' });
    const done = await createTask(host, { eventId, title: 'Done', dueAt: iso(-60_000, now.getTime()) });
    await updateTask(host, { eventId, taskId: done.taskId, status: 'DONE' });

    const alerts = await myAlerts(now);
    expect(alerts.map((alert) => alert.taskId).sort()).toEqual([overdue.taskId, soon.taskId].sort());
    expect(alerts.find((alert) => alert.taskId === overdue.taskId)?.kind).toBe('overdue');
    expect(alerts.find((alert) => alert.taskId === soon.taskId)?.kind).toBe('dueSoon');

    // The stub logs ids only — never titles.
    logged.length = 0;
    const result = await handleDeadlineAlerts(fakeLog, now);
    expect(result.dueSoon).toBeGreaterThanOrEqual(1);
    expect(result.overdue).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(logged)).toContain(overdue.taskId);
    expect(JSON.stringify(logged)).toContain(soon.taskId);
    expect(JSON.stringify(logged)).not.toContain('Overdue');

    // Closed events never alert: cancel and re-scan.
    await cancelEvent(host, { eventId });
    expect(await myAlerts(now)).toEqual([]);
  });

  it('is idempotent: running twice returns the same counts', async () => {
    const host = await makeHost();
    const now = new Date('2000-06-01T12:00:00Z');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    mine.push(eventId);
    await createTask(host, { eventId, title: 'Nudge me', dueAt: iso(2 * 60 * 60 * 1000, now.getTime()) });
    const first = await myAlerts(now);
    const second = await myAlerts(now);
    expect(second).toEqual(first);
    expect(first).toHaveLength(1);
    expect(first[0]?.kind).toBe('dueSoon');
  });
});
