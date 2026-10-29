import type { AdminRole } from '@tiwa/db';
import { ForbiddenError } from '../shared/errors.js';
import type { Action } from './actions.js';
import { authorizeGuest } from './authorize-guest.js';
import { MATRIX, type Rule } from './matrix.js';
import type { ParticipantPermissions } from './presets.js';
import type { EventRole } from './roles.js';

export type Actor =
  | { kind: 'user'; userId: string; isAdmin: boolean; adminRole?: AdminRole }
  | { kind: 'guest'; guestId?: string; ticketId?: string; guestSessionId?: string; eventId: string }
  | { kind: 'system' };

export interface EventAccess {
  eventId: string;
  role: EventRole;
  permissions: ParticipantPermissions;
}

export interface AuthResource {
  eventId?: string;
  access?: EventAccess | null;
  /** Minor units, required for quote.accept / payment.make. */
  amountMinor?: bigint;
  /** True when the resource is the actor's own booking/brief. */
  isOwnBooking?: boolean;
}

const TIER_ORDER: Record<string, number> = {
  none: 0,
  view: 1,
  upload: 1,
  edit: 2,
  moderate: 2,
};

function meetsTier(actual: string, required: string): boolean {
  return (TIER_ORDER[actual] ?? -1) >= (TIER_ORDER[required] ?? Number.POSITIVE_INFINITY);
}

function deny(action: Action, reason: string, extra?: Record<string, unknown>): never {
  throw new ForbiddenError(`Not allowed: ${action}`, { action, reason, ...extra });
}

function checkRule(rule: Rule, action: Action, resource: AuthResource, access: EventAccess): void {
  switch (rule.decision) {
    case 'allow':
      return;
    case 'deny':
      return deny(action, 'role-denied', { role: access.role });
    case 'grant': {
      const granted = access.permissions[rule.key];
      if (granted === true) return;
      return deny(action, 'grant-required', { role: access.role, grant: rule.key });
    }
    case 'tier': {
      const actual = access.permissions[rule.field];
      if (typeof actual === 'string' && meetsTier(actual, rule.atLeast)) return;
      return deny(action, 'tier-required', { role: access.role, field: rule.field, atLeast: rule.atLeast });
    }
    case 'approveUpTo': {
      const cap = access.permissions.approveUpToMinor;
      const amount = resource.amountMinor;
      if (amount === undefined) return deny(action, 'amount-required');
      if (cap === null || amount <= cap) return;
      return deny(action, 'amount-exceeds-approval', { cap: cap.toString(), amount: amount.toString() });
    }
    case 'own': {
      if (resource.isOwnBooking === true) return;
      return deny(action, 'own-booking-only', { role: access.role });
    }
  }
}

/**
 * Authorize an actor for an action. Throws ForbiddenError; never returns
 * false (Backend.md §4.1). Pure — the caller loads EventParticipant rows
 * (cached per request) and passes them as `resource.access`.
 *
 * Not covered here (enforced with data in later phases):
 * - public-vs-private event viewing, ticket capacity, review-after-completion
 *   and guest-contact redaction (P3/P4/P5), thread-level chat scope (P13),
 *   admin sub-role scoping (P16), payout/legal holds (P8).
 */
export function authorize(actor: Actor, action: Action, resource: AuthResource = {}): void {
  if (actor.kind === 'system') return;

  if (actor.kind === 'guest') {
    return authorizeGuest(actor, action, resource);
  }

  if (action.startsWith('admin.')) {
    if (actor.isAdmin) return;
    return deny(action, 'admin-only');
  }
  if (actor.isAdmin) {
    // Least privilege: staff act only through admin.* (support flows in P16).
    return deny(action, 'admin-scope');
  }

  const access = resource.access ?? null;
  if (!access) return deny(action, 'not-a-participant');
  if (resource.eventId !== undefined && resource.eventId !== access.eventId) {
    return deny(action, 'wrong-event');
  }
  const rule = MATRIX[access.role][action] ?? { decision: 'deny' };
  checkRule(rule, action, resource, access);
}
