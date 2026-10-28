/**
 * Stable error codes surfaced to the UI (Backend.md §13).
 * The server-action wrapper (P2) maps these to `{ error: { code, message } }`.
 */
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_TRANSITION'
  | 'LIMIT_REACHED'
  | 'RATE_LIMITED'
  | 'PAYMENT_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'FEATURE_DISABLED'
  | 'CURRENCY_MISMATCH'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 422,
  LIMIT_REACHED: 422,
  RATE_LIMITED: 429,
  PAYMENT_FAILED: 502,
  PROVIDER_UNAVAILABLE: 503,
  FEATURE_DISABLED: 409,
  CURRENCY_MISMATCH: 400,
  INTERNAL: 500,
};

/** Base class for every expected failure. Never leaks PII — keep details free of names, phones, emails. */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details: unknown = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  toJSON(): { code: ErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details: unknown = {}) {
    super('VALIDATION', message, details);
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = 'Sign in to continue', details: unknown = {}) {
    super('UNAUTHENTICATED', message, details);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You do not have permission for that', details: unknown = {}) {
    super('FORBIDDEN', message, details);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Not found', details: unknown = {}) {
    super('NOT_FOUND', message, details);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details: unknown = {}) {
    super('CONFLICT', message, details);
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(message: string, details: unknown = {}) {
    super('INVALID_TRANSITION', message, details);
  }
}

export class LimitReachedError extends DomainError {
  constructor(message: string, details: unknown = {}) {
    super('LIMIT_REACHED', message, details);
  }
}

export class RateLimitedError extends DomainError {
  constructor(message = 'Too many attempts — try again shortly', details: unknown = {}) {
    super('RATE_LIMITED', message, details);
  }
}

export class PaymentFailedError extends DomainError {
  constructor(message = 'The payment did not go through', details: unknown = {}) {
    super('PAYMENT_FAILED', message, details);
  }
}

export class ProviderUnavailableError extends DomainError {
  constructor(message = 'The provider is unreachable — try again shortly', details: unknown = {}) {
    super('PROVIDER_UNAVAILABLE', message, details);
  }
}

export class FeatureDisabledError extends DomainError {
  constructor(message = 'This feature is not enabled', details: unknown = {}) {
    super('FEATURE_DISABLED', message, details);
  }
}

/** Type guard for catch blocks deciding between expected and unexpected failures. */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
