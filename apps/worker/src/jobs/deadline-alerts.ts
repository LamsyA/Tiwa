import { alreadyNotified, findDeadlineAlerts, notify, type DeadlineAlert, type createLogger } from '@tiwa/core';
import { prisma } from '@tiwa/db';

export const DEADLINE_ALERTS_JOB = 'events/deadline-alerts' as const;
export const DEADLINE_ALERTS_EVERY_MS = 60 * 60 * 1000;

type Log = ReturnType<typeof createLogger>;

const SYSTEM = { kind: 'system' } as const;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Days after the due date on which an overdue task is mentioned again. */
const OVERDUE_DAYS = new Set([0, 1, 3, 7]);
const MAX_LINES = 5;

/**
 * Backend.md §10: hourly scan for tasks due in 24 h / overdue (P13-T04).
 * D-X89, no spam: each person gets at most ONE digest per day, covering the
 * task owner (or the event creator) and the event's planners. A due-soon task
 * is mentioned once; an overdue task on the day it slips and 1, 3 and 7 days
 * later, then never again. The notification row is the sent record.
 */
export async function handleDeadlineAlerts(log: Log, now = new Date()): Promise<{ dueSoon: number; overdue: number }> {
  const alerts = await findDeadlineAlerts(now);
  const bucket = now.toISOString().slice(0, 10);
  const byUser = new Map<string, DeadlineAlert[]>();
  for (const alert of alerts) {
    if (alert.kind === 'overdue') {
      const daysLate = Math.floor((now.getTime() - alert.dueAt.getTime()) / DAY_MS);
      if (!OVERDUE_DAYS.has(daysLate)) continue;
    }
    const people = new Set([alert.ownerUserId ?? alert.creatorUserId, ...alert.plannerUserIds]);
    for (const userId of people) byUser.set(userId, [...(byUser.get(userId) ?? []), alert]);
  }

  let dueSoon = 0;
  let overdue = 0;
  for (const [userId, all] of byUser) {
    const key = `digest:${bucket}`;
    if (await alreadyNotified(userId, 'task.deadline', key)) continue;
    // Due-soon tasks are mentioned once ever: skip ones an earlier digest listed.
    const mentioned = await mentionedDueSoon(userId);
    const items = all.filter((alert) => alert.kind === 'overdue' || !mentioned.has(alert.taskId));
    if (items.length === 0) continue;
    const late = items.filter((a) => a.kind === 'overdue');
    const soon = items.filter((a) => a.kind === 'dueSoon');
    const title =
      late.length > 0
        ? `${late.length} overdue task${late.length === 1 ? '' : 's'}${soon.length ? `, ${soon.length} due soon` : ''}`
        : `${soon.length} task${soon.length === 1 ? '' : 's'} due in the next day`;
    const lines = [...late, ...soon]
      .slice(0, MAX_LINES)
      .map((a) => `${a.kind === 'overdue' ? 'Overdue' : 'Due soon'}: ${a.title} (${a.eventName})`);
    if (items.length > MAX_LINES) lines.push(`+${items.length - MAX_LINES} more`);
    const events = new Set(items.map((a) => a.eventId));
    const first = items[0] as DeadlineAlert;
    await notify(SYSTEM, {
      userId,
      type: 'task.deadline',
      title,
      body: lines.join(' · '),
      url: events.size === 1 ? `/events/${first.eventId}/plan` : '/today',
      data: { key, tasks: items.length, dueSoon: soon.map((a) => a.taskId).join(',') },
    });
    overdue += late.length;
    dueSoon += soon.length;
  }
  log.info({ topic: DEADLINE_ALERTS_JOB, dueSoon, overdue, people: byUser.size }, 'deadline digests sent');
  return { dueSoon, overdue };
}

async function mentionedDueSoon(userId: string): Promise<Set<string>> {
  const rows = await prisma.notification.findMany({
    where: { userId, type: 'task.deadline', createdAt: { gte: new Date(Date.now() - 3 * DAY_MS) } },
    select: { data: true },
    take: 10,
  });
  const ids = new Set<string>();
  for (const row of rows) {
    const list = (row.data as { dueSoon?: unknown } | null)?.dueSoon;
    if (typeof list === 'string') for (const id of list.split(',')) if (id) ids.add(id);
  }
  return ids;
}
