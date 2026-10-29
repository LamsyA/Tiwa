import { ConflictError, ForbiddenError, RateLimitedError, ValidationError } from '@tiwa/core';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { makeAction, makeUserAction, type Ctx } from './action.js';

const signedIn: Ctx = { actor: { kind: 'user', userId: 'u_1', isAdmin: false }, requestId: 'req-1', ip: '1.2.3.4' };
const signedOut: Ctx = { actor: null, requestId: 'req-2', ip: '1.2.3.4' };

function setup(ctx: Ctx) {
  const report = vi.fn();
  const getCtx = vi.fn(async () => ctx);
  return { report, getCtx, action: makeAction({ getCtx, report }), userAction: makeUserAction({ getCtx, report }) };
}

const schema = z.object({ name: z.string().min(2, 'nameTooShort') });

describe('action wrapper (Backend.md §4.2)', () => {
  it('returns data on success and passes ctx', async () => {
    const { action } = setup(signedIn);
    const run = action(schema, async (input, ctx) => ({ hello: input.name, by: ctx.actor?.userId }));
    expect(await run({ name: 'Ada' })).toEqual({ ok: true, data: { hello: 'Ada', by: 'u_1' } });
  });

  it('returns VALIDATION with field message keys before touching ctx', async () => {
    const { action, getCtx } = setup(signedIn);
    const fn = vi.fn();
    const result = await action(schema, fn)({ name: 'A' });
    expect(result).toEqual({ ok: false, code: 'VALIDATION', fieldErrors: { name: ['nameTooShort'] } });
    expect(fn).not.toHaveBeenCalled();
    expect(getCtx).not.toHaveBeenCalled();
  });

  it.each([
    [new ForbiddenError(), 'FORBIDDEN'],
    [new ConflictError('taken'), 'CONFLICT'],
    [new RateLimitedError(), 'RATE_LIMITED'],
  ] as const)('maps %s to its code without reporting', async (error, code) => {
    const { action, report } = setup(signedIn);
    const result = await action(schema, async () => {
      throw error;
    })({ name: 'Ada' });
    expect(result).toEqual({ ok: false, code });
    expect(report).not.toHaveBeenCalled();
  });

  it('surfaces a domain VALIDATION field + message key as fieldErrors', async () => {
    const { action } = setup(signedIn);
    const result = await action(schema, async () => {
      throw new ValidationError('Invalid phone number', { field: 'phone', key: 'invalidPhone' });
    })({ name: 'Ada' });
    expect(result).toEqual({ ok: false, code: 'VALIDATION', fieldErrors: { phone: ['invalidPhone'] } });
  });

  it('turns unexpected errors into INTERNAL, reports them with request context only', async () => {
    const { action, report } = setup(signedIn);
    const boom = new Error('db exploded for +2348012345678');
    const result = await action(schema, async () => {
      throw boom;
    })({ name: 'Ada' });
    expect(result).toEqual({ ok: false, code: 'INTERNAL' });
    expect(JSON.stringify(result)).not.toContain('exploded');
    expect(report).toHaveBeenCalledWith(boom, { requestId: 'req-1', userId: 'u_1' });
  });

  it('userAction refuses signed-out callers with UNAUTHENTICATED', async () => {
    const { userAction } = setup(signedOut);
    const fn = vi.fn();
    expect(await userAction(schema, fn)({ name: 'Ada' })).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('userAction runs for signed-in callers', async () => {
    const { userAction } = setup(signedIn);
    expect(await userAction(schema, async (_input, ctx) => ctx.actor.userId)({ name: 'Ada' })).toEqual({
      ok: true,
      data: 'u_1',
    });
  });
});
