'use server';

import { businessSchema, completeBusinessOnboarding, completeHostProfile, hostProfileSchema } from '@tiwa/core';
import { userAction } from '@/lib/ctx.js';

export const saveHostProfile = userAction(hostProfileSchema, (input, ctx) =>
  completeHostProfile(ctx.actor.userId, input),
);

export const saveBusinessProfile = userAction(businessSchema, (input, ctx) =>
  completeBusinessOnboarding(ctx.actor.userId, input),
);
