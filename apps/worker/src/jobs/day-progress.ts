import { createLogger, progressDueBookings, promptDueSignoffs } from '@tiwa/core';

type Log = ReturnType<typeof createLogger>;

/** Backend.md P12-T07 (hourly): CONFIRMED bookings whose service date has
 * come move to IN_PROGRESS, and bookings awaiting delivery sign-off after
 * their event queue a `day.signoff_due` stub for P13 `notify()`. */
export const DAY_PROGRESS_JOB = 'day/progress' as const;
export const DAY_PROGRESS_EVERY_MS = 60 * 60 * 1000;

export async function handleDayProgress(
  log: Log,
  now = new Date(),
): Promise<{ started: number; prompted: number }> {
  const started = await progressDueBookings(now);
  const prompted = await promptDueSignoffs(now);
  if (started.started > 0 || prompted.prompted > 0) {
    log.info(
      { topic: DAY_PROGRESS_JOB, started: started.started, prompted: prompted.prompted },
      'booking progress',
    );
  }
  return { started: started.started, prompted: prompted.prompted };
}
