import { UnauthenticatedError, isDomainError, uuidv7, type Actor, type ErrorCode } from '@tiwa/core';
import type { z } from 'zod';

// Server action wrapper (Backend.md §4.2). Every action: validate with Zod →
// build ctx → run → map errors to stable codes (Backend.md §13). Field errors
// carry message keys; the UI turns codes and keys into strings from en.json.

export interface Ctx {
  /** `null` when nobody is signed in. */
  actor: Extract<Actor, { kind: 'user' }> | null;
  requestId: string;
  ip: string;
}

/** Ctx for actions that need a signed-in user. */
export interface UserCtx extends Ctx {
  actor: Extract<Actor, { kind: 'user' }>;
}

export type ActionResult<O> =
  { ok: true; data: O } | { ok: false; code: ErrorCode; fieldErrors?: Record<string, string[] | undefined> };

export type ErrorReporter = (error: unknown, context: { requestId: string; userId?: string }) => void;

export function requireUser(ctx: Ctx): UserCtx {
  if (!ctx.actor) throw new UnauthenticatedError();
  return ctx as UserCtx;
}

/** Domain errors map to their code; anything else is reported and becomes INTERNAL (no details leak). */
export function mapDomainError(
  error: unknown,
  ctx: Ctx,
  report: ErrorReporter,
): Extract<ActionResult<never>, { ok: false }> {
  if (isDomainError(error)) {
    const details = error.details as { field?: unknown; key?: unknown } | null;
    if (error.code === 'VALIDATION' && typeof details?.field === 'string' && typeof details.key === 'string') {
      return { ok: false, code: 'VALIDATION', fieldErrors: { [details.field]: [details.key] } };
    }
    return { ok: false, code: error.code };
  }
  report(error, { requestId: ctx.requestId, ...(ctx.actor ? { userId: ctx.actor.userId } : {}) });
  return { ok: false, code: 'INTERNAL' };
}

export interface ActionDeps {
  getCtx: () => Promise<Ctx>;
  report: ErrorReporter;
}

export function makeAction(deps: ActionDeps) {
  return <I extends z.ZodTypeAny, O>(schema: I, fn: (input: z.infer<I>, ctx: Ctx) => Promise<O>) =>
    async (raw: unknown): Promise<ActionResult<O>> => {
      const input = schema.safeParse(raw);
      if (!input.success) {
        return { ok: false, code: 'VALIDATION', fieldErrors: input.error.flatten().fieldErrors };
      }
      let ctx: Ctx = { actor: null, requestId: uuidv7(), ip: 'unknown' };
      try {
        ctx = await deps.getCtx();
        return { ok: true, data: await fn(input.data, ctx) };
      } catch (error) {
        return mapDomainError(error, ctx, deps.report);
      }
    };
}

/** Same as `makeAction`, but the action runs only for a signed-in user. */
export function makeUserAction(deps: ActionDeps) {
  const action = makeAction(deps);
  return <I extends z.ZodTypeAny, O>(schema: I, fn: (input: z.infer<I>, ctx: UserCtx) => Promise<O>) =>
    action(schema, (input, ctx) => fn(input, requireUser(ctx)));
}
