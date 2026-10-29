import * as Sentry from '@sentry/nextjs';
import { uuidv7 } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { makeAction, makeUserAction, type Ctx, type ErrorReporter, type UserCtx } from './action.js';
import { auth } from './auth.js';

/**
 * Request context: session → actor, request id, client IP. Cached per
 * request. Suspended or deleted accounts get no actor (treated as signed out).
 */
export const getCtx = cache(async (): Promise<Ctx> => {
  const requestHeaders = await headers();
  const requestId = requestHeaders.get('x-request-id') ?? uuidv7();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const session = await auth.api.getSession({ headers: requestHeaders });
  const userId = session?.user?.id as string | undefined;
  if (!userId) return { actor: null, requestId, ip };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, adminRole: true, suspendedAt: true, deletedAt: true },
  });
  if (!user || user.suspendedAt || user.deletedAt) return { actor: null, requestId, ip };
  return {
    actor: {
      kind: 'user',
      userId,
      isAdmin: user.isAdmin,
      ...(user.adminRole ? { adminRole: user.adminRole } : {}),
    },
    requestId,
    ip,
  };
});

// Context only: request id + user id. Never names, phones or emails (PII scrub is the backstop).
const report: ErrorReporter = (error, context) => {
  Sentry.captureException(error, {
    tags: { requestId: context.requestId },
    ...(context.userId ? { user: { id: context.userId } } : {}),
  });
};

export const action = makeAction({ getCtx, report });
export const userAction = makeUserAction({ getCtx, report });

/** For pages: the signed-in user's ctx, or a redirect to /login that comes back to `next`. */
export async function requirePageUser(next: string): Promise<UserCtx> {
  const ctx = await getCtx();
  if (!ctx.actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  return ctx as UserCtx;
}
