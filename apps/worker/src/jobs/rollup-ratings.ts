import { createLogger, rollupVendorRatings } from '@tiwa/core';

type Log = ReturnType<typeof createLogger>;

/** Hourly rating roll-up (P14-T01): cached profile columns feed search
 * sort/filter and the public score (REV-05 gate applied at write time). */
export const ROLLUP_RATINGS_JOB = 'reviews/rollup-ratings' as const;
export const ROLLUP_RATINGS_EVERY_MS = 60 * 60 * 1000;

export async function handleRollupRatings(log: Log): Promise<{ orgs: number }> {
  const result = await rollupVendorRatings();
  if (result.orgs > 0) log.info({ topic: ROLLUP_RATINGS_JOB, ...result }, 'ratings rolled up');
  return result;
}
