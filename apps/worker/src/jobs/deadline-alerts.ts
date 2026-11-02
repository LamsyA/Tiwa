import { alreadyNotified, findDeadlineAlerts, notify, type createLogger } from '@tiwa/core';

export const DEADLINE_ALERTS_JOB = 'events/deadline-alerts' as const;
export const DEADLINE_ALERTS_EVERY_MS = 60 * 60 * 1000;

type Log = ReturnType<typeof createLogger>;

const SYSTEM = { kind: 'system' } as const;

/** Backend.md §10: hourly scan for tasks due in 24 h / overdue, fanned out
 * through `notify()` (P13-T04; was a log-only stub until P13). One ping per
 * task per kind per day — the notification row is the sent record. */
export async function handleDeadlineAlerts(log: Log, now = new Date()): Promise<{ dueSoon: number; overdue: number }> {
  const alerts = await findDeadlineAlerts(now);
  const bucket = now.toISOString().slice(0, 10);
  let dueSoon = 0;
  let overdue = 0;
  for (const alert of alerts) {
    const userId = alert.ownerUserId ?? alert.creatorUserId;
    const key = `task:${alert.taskId}:${alert.kind}:${bucket}`;
    if (await alreadyNotified(userId, 'task.deadline', key)) continue;
    await notify(SYSTEM, {
      userId,
      type: 'task.deadline',
      title: alert.kind === 'overdue' ? `Overdue: ${alert.title}` : `Due soon: ${alert.title}`,
      body: `${alert.eventName} · due ${alert.dueAt.toISOString().slice(0, 10)}`,
      url: `/events/${alert.eventId}/plan`,
      data: { eventId: alert.eventId, taskId: alert.taskId, kind: alert.kind, key },
    });
    if (alert.kind === 'overdue') overdue += 1;
    else dueSoon += 1;
  }
  log.info({ topic: DEADLINE_ALERTS_JOB, dueSoon, overdue }, 'deadline alerts fanned out');
  return { dueSoon, overdue };
}
