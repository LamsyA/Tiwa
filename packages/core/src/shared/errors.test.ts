import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DomainError,
  FeatureDisabledError,
  ForbiddenError,
  InvalidTransitionError,
  isDomainError,
  LimitReachedError,
  NotFoundError,
  PaymentFailedError,
  ProviderUnavailableError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from './errors.js';

describe('DomainError', () => {
  it('carries stable codes and HTTP statuses', () => {
    const cases: Array<[DomainError, string, number]> = [
      [new ValidationError('bad'), 'VALIDATION', 400],
      [new UnauthenticatedError(), 'UNAUTHENTICATED', 401],
      [new ForbiddenError(), 'FORBIDDEN', 403],
      [new NotFoundError(), 'NOT_FOUND', 404],
      [new ConflictError('taken'), 'CONFLICT', 409],
      [new InvalidTransitionError('nope'), 'INVALID_TRANSITION', 422],
      [new LimitReachedError('max'), 'LIMIT_REACHED', 422],
      [new RateLimitedError(), 'RATE_LIMITED', 429],
      [new PaymentFailedError(), 'PAYMENT_FAILED', 502],
      [new ProviderUnavailableError(), 'PROVIDER_UNAVAILABLE', 503],
      [new FeatureDisabledError(), 'FEATURE_DISABLED', 409],
    ];
    for (const [error, code, status] of cases) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
      expect(error.toJSON()).toEqual({ code, message: error.message });
    }
  });

  it('isDomainError separates expected failures from bugs', () => {
    expect(isDomainError(new ValidationError('bad'))).toBe(true);
    expect(isDomainError(new Error('boom'))).toBe(false);
    expect(isDomainError('nope')).toBe(false);
  });
});
