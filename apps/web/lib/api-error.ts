import { NextResponse } from 'next/server';
import {
  ConflictError,
  ForbiddenError,
  InvalidTransitionError,
  LimitReachedError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from '@tiwa/core';

/**
 * Maps core DomainErrors to HTTP responses ({ ok, error: { code } }).
 * Field/key hints ride along for client i18n lookup; messages never leak
 * internals (Backend.md §12).
 */
export function coreErrorResponse(error: unknown): NextResponse {
  if (error instanceof ValidationError) return err(400, error);
  if (error instanceof UnauthenticatedError) return err(401, error);
  if (error instanceof ForbiddenError) return err(403, error);
  if (error instanceof NotFoundError) return err(404, error);
  if (error instanceof ConflictError || error instanceof InvalidTransitionError || error instanceof LimitReachedError) {
    return err(409, error);
  }
  if (error instanceof RateLimitedError) return err(429, error);
  return NextResponse.json({ ok: false, error: { code: 'INTERNAL' } }, { status: 500 });
}

type Details = { field?: unknown; key?: unknown; retryAfterSec?: unknown };

function err(status: number, error: { code: string; details?: unknown }): NextResponse {
  const raw = (error.details ?? {}) as Details;
  const details: Record<string, unknown> = {};
  if (typeof raw.field === 'string') details.field = raw.field;
  if (typeof raw.key === 'string') details.key = raw.key;
  if (typeof raw.retryAfterSec === 'number') details.retryAfterSec = raw.retryAfterSec;
  return NextResponse.json({ ok: false, error: { code: error.code, ...details } }, { status });
}

