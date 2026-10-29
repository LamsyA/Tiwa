import type { OrgRole } from '@tiwa/db';
import { ForbiddenError } from '../shared/errors.js';
import type { Actor } from './authorize.js';

// Organisation-scoped permissions (Backend.md §6: "org ADMIN+", "org OWNER").
// Event roles never grant org rights; only Membership.role does.
export const ORG_ACTIONS = [
  'org.view',
  'org.manage', // profile, packages, availability (ADMIN+)
  'org.members.manage', // invite, change role, remove (ADMIN+; role rules in orgs/members)
  'org.bank.manage', // bank account and payouts (OWNER only)
  'org.delete',
] as const;

export type OrgAction = (typeof ORG_ACTIONS)[number];

export const ORG_MATRIX: Record<OrgRole, Record<OrgAction, boolean>> = {
  OWNER: {
    'org.view': true,
    'org.manage': true,
    'org.members.manage': true,
    'org.bank.manage': true,
    'org.delete': true,
  },
  ADMIN: {
    'org.view': true,
    'org.manage': true,
    'org.members.manage': true,
    'org.bank.manage': false,
    'org.delete': false,
  },
  STAFF: {
    'org.view': true,
    'org.manage': false,
    'org.members.manage': false,
    'org.bank.manage': false,
    'org.delete': false,
  },
};

export interface OrgAccess {
  orgId: string;
  role: OrgRole;
}

/** Throws ForbiddenError; never returns false. The caller loads the actor's Membership for `orgId`. */
export function authorizeOrg(actor: Actor, action: OrgAction, orgId: string, access: OrgAccess | null): void {
  if (actor.kind === 'system') return;
  if (actor.kind !== 'user' || actor.isAdmin) {
    throw new ForbiddenError(`Not allowed: ${action}`, { action, reason: 'org-members-only' });
  }
  if (!access || access.orgId !== orgId) {
    throw new ForbiddenError(`Not allowed: ${action}`, { action, reason: 'not-a-member' });
  }
  if (!ORG_MATRIX[access.role][action]) {
    throw new ForbiddenError(`Not allowed: ${action}`, { action, reason: 'org-role-denied', role: access.role });
  }
}
