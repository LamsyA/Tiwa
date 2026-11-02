'use server';

import { reportReview, reportReviewSchema } from '@tiwa/core';
import { userAction } from '@/lib/ctx.js';

/** Report a review from a public profile (REV-06). */
export const reportReviewAction = userAction(reportReviewSchema, async (input, ctx) => {
  const result = await reportReview(ctx.actor, input);
  return result;
});
