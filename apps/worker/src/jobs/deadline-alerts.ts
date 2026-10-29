import { findDeadlineAlerts, type createLogger } from '@tiwa/core';

export const DEADLINE_ALERTS_JOB = 'events/deadline-alerts' as const;
export const DEADLINE_ALERTS_EVERY_MS = 60 * 60 * 1000;

type Log = ReturnType<typeof createLogger>;

/**
 * Backend.md §10: hourly scan for tasks due in 24 h / overdue.
 * Until P13 `messaging/notify` exists this is a stub: it logs ids only
 * (never titles) and returns counts. Read-only, so safe to run twice.
 */
export async function handleDeadlineAlerts(log: Log, now = new Date()): Promise<{ dueSoon: number; overdue: number }> {
  const alerts = await findDeadlineAlerts(now);
  let dueSoon = 0;
  let overdue = 0;
  for (const alert of alerts) {
    if (alert.kind === 'overdue') overdue += 1;
    else dueSoon += 1;
    log.info(
      { topic: DEADLINE_ALERTS_JOB, taskId: alert.taskId, eventId: alert.eventId, kind: alert.kind },
      'deadline alert (stub)',
    );
  }
  return { dueSoon, overdue };
}
