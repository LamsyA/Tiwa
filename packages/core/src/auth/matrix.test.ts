import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../shared/errors.js';
import { ACTIONS, type Action } from './actions.js';
import { authorize, type Actor, type AuthResource } from './authorize.js';
import { MATRIX } from './matrix.js';
import { ORG_ACTIONS, ORG_MATRIX, authorizeOrg, type OrgAction } from './org.js';
import type { ParticipantPermissions } from './presets.js';
import type { EventRole } from './roles.js';

/**
 * PRD.md §2.1, written out independently of matrix.ts so a wrong rule there
 * fails here. Every role × every action (gate P2: 100% coverage).
 *
 * Y  allowed with no grants
 * N  denied even with every grant and on the actor's own booking
 * G  allowed only when the host grants it (permission, tier or approval limit)
 * O  allowed only on the actor's own booking
 */
type Expect = 'Y' | 'N' | 'G' | 'O';
type Row = [Expect, Expect, Expect, Expect, Expect, Expect];
const ROLES: EventRole[] = ['HOST', 'CO_HOST', 'PLANNER', 'PLANNER_STAFF', 'VENDOR', 'PHOTOGRAPHER'];

//                                     Host  Co   Plan  Staff Vend  Photo
// prettier-ignore
const EVENT_ROWS: Partial<Record<Action, Row>> = {
  'event.view':                       ['Y', 'Y', 'Y', 'Y', 'O', 'O'],
  'event.edit':                       ['Y', 'G', 'Y', 'G', 'N', 'N'],
  'event.members.manage':             ['Y', 'N', 'G', 'N', 'N', 'N'],
  'event.close':                      ['Y', 'N', 'N', 'N', 'N', 'N'],
  'money.view':                       ['Y', 'G', 'Y', 'G', 'O', 'O'],
  'money.edit':                       ['Y', 'G', 'Y', 'G', 'N', 'N'],
  'quote.accept':                     ['G', 'G', 'G', 'N', 'N', 'N'],
  'payment.make':                     ['G', 'G', 'G', 'N', 'N', 'N'],
  'guests.manage':                    ['Y', 'G', 'Y', 'Y', 'N', 'N'],
  'guests.contacts.view':             ['Y', 'G', 'Y', 'Y', 'N', 'N'],
  'tickets.manage':                   ['Y', 'G', 'Y', 'G', 'N', 'N'],
  'checkin.scan':                     ['Y', 'G', 'Y', 'Y', 'N', 'N'],
  'runofshow.edit':                   ['Y', 'G', 'Y', 'Y', 'N', 'N'],
  'runofshow.updateOwn':              ['Y', 'Y', 'Y', 'Y', 'O', 'O'],
  'moments.moderate':                 ['Y', 'G', 'Y', 'G', 'N', 'N'],
  'moments.upload.guest':             ['Y', 'Y', 'Y', 'Y', 'Y', 'Y'],
  'moments.upload.official':          ['N', 'N', 'G', 'N', 'N', 'Y'],
  'review.create':                    ['Y', 'N', 'Y', 'N', 'N', 'N'],
  'review.reply':                     ['N', 'N', 'N', 'N', 'N', 'N'],
  'review.report':                    ['Y', 'Y', 'Y', 'Y', 'Y', 'Y'],
  'dispute.open':                     ['Y', 'N', 'Y', 'N', 'O', 'O'],
  'dispute.addEvidence':              ['Y', 'N', 'Y', 'N', 'O', 'O'],
  'dispute.decide':                   ['N', 'N', 'N', 'N', 'N', 'N'],
  'subscriptions.startSubscription':  ['Y', 'N', 'N', 'N', 'N', 'N'],
  'subscriptions.cancelSubscription': ['Y', 'N', 'N', 'N', 'N', 'N'],
  'subscriptions.buyMomentsPlus':     ['Y', 'N', 'N', 'N', 'N', 'N'],
  'subscriptions.entitlements':       ['Y', 'Y', 'Y', 'Y', 'Y', 'Y'],
  'org.manage':                       ['N', 'N', 'N', 'N', 'N', 'N'],
};
// "Chat with vendors/planners": co-host ○; vendors reply + own threads (thread scope lands in P13).
const CHAT_ROW: Row = ['Y', 'G', 'Y', 'Y', 'Y', 'Y'];
// AI drafts for people who can plan; vendors have no planning surface.
const AI_ROW: Row = ['Y', 'G', 'Y', 'G', 'N', 'N'];
// admin.* is decided before any event role (tested under actor kinds below).
const ADMIN_ROW: Row = ['N', 'N', 'N', 'N', 'N', 'N'];

function expectedRow(action: Action): Row {
  const row = EVENT_ROWS[action];
  if (row) return row;
  if (action.startsWith('chat.') || action.startsWith('messaging.')) return CHAT_ROW;
  if (action.startsWith('ai.')) return AI_ROW;
  if (action.startsWith('admin.')) return ADMIN_ROW;
  throw new Error(`No expectation for ${action} — add it to EVENT_ROWS`);
}

const ALL_GRANTS: ParticipantPermissions = {
  preset: 'test-all',
  eventEdit: true,
  membersManage: true,
  money: 'edit',
  approveUpToMinor: null,
  guests: 'edit',
  guestContacts: true,
  tickets: 'edit',
  moments: 'moderate',
  momentsOfficial: true,
  runOfShow: 'edit',
  chat: true,
};

const NO_GRANTS: ParticipantPermissions = {
  preset: 'test-none',
  eventEdit: false,
  membersManage: false,
  money: 'none',
  approveUpToMinor: 0n,
  guests: 'none',
  guestContacts: false,
  tickets: 'none',
  moments: 'none',
  momentsOfficial: false,
  runOfShow: 'none',
  chat: false,
};

const user: Actor = { kind: 'user', userId: 'u_1', isAdmin: false };

function allowed(role: EventRole, action: Action, permissions: ParticipantPermissions, own: boolean): boolean {
  const resource: AuthResource = {
    eventId: 'evt_1',
    access: { eventId: 'evt_1', role, permissions },
    amountMinor: 1n,
    isOwnBooking: own,
  };
  try {
    authorize(user, action, resource);
    return true;
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenError);
    return false;
  }
}

function observed(role: EventRole, action: Action): Expect {
  const bare = allowed(role, action, NO_GRANTS, false);
  const granted = allowed(role, action, ALL_GRANTS, false);
  const ownBare = allowed(role, action, NO_GRANTS, true);
  const ownGranted = allowed(role, action, ALL_GRANTS, true);
  if (bare) return 'Y';
  if (!granted && !ownGranted) return 'N';
  if (granted) return 'G';
  return ownBare ? 'O' : 'G';
}

const cases = ROLES.flatMap((role, index) =>
  ACTIONS.map((action) => ({ role, action, want: expectedRow(action)[index] as Expect })),
);

describe('permission matrix: every role × every action (PRD §2.1)', () => {
  it('covers the full grid', () => {
    expect(cases).toHaveLength(ROLES.length * ACTIONS.length);
  });

  it('matrix.ts has an explicit rule for every role × action (no silent default)', () => {
    const missing = ROLES.flatMap((role) =>
      ACTIONS.filter((action) => !action.startsWith('admin.') && !MATRIX[role][action]).map(
        (action) => `${role}:${action}`,
      ),
    );
    expect(missing).toEqual([]);
  });

  it.each(cases)('$role $action → $want', ({ role, action, want }) => {
    expect(observed(role, action)).toBe(want);
  });
});

describe('guest column: invite/ticket holders may only view and upload', () => {
  const guest: Actor = { kind: 'guest', guestId: 'g_1', eventId: 'evt_1' };
  it.each(ACTIONS.map((action) => ({ action })))('guest $action', ({ action }) => {
    let ok = true;
    try {
      authorize(guest, action, { eventId: 'evt_1' });
    } catch {
      ok = false;
    }
    expect(ok).toBe(action === 'event.view' || action === 'moments.upload.guest');
  });
});

describe('org matrix: every org role × org action', () => {
  const want: Record<string, OrgAction[]> = {
    OWNER: [...ORG_ACTIONS],
    ADMIN: ['org.view', 'org.manage', 'org.members.manage'],
    STAFF: ['org.view'],
  };
  const orgCases = (['OWNER', 'ADMIN', 'STAFF'] as const).flatMap((role) =>
    ORG_ACTIONS.map((action) => ({ role, action, ok: want[role]?.includes(action) ?? false })),
  );

  it.each(orgCases)('$role $action → $ok', ({ role, action, ok }) => {
    expect(ORG_MATRIX[role][action]).toBe(ok);
    const run = () => authorizeOrg(user, action, 'org_1', { orgId: 'org_1', role });
    if (ok) expect(run).not.toThrow();
    else expect(run).toThrow(ForbiddenError);
  });

  it('denies non-members, other orgs, guests and admins; allows system', () => {
    expect(() => authorizeOrg(user, 'org.view', 'org_1', null)).toThrow(ForbiddenError);
    expect(() => authorizeOrg(user, 'org.view', 'org_2', { orgId: 'org_1', role: 'OWNER' })).toThrow(ForbiddenError);
    expect(() =>
      authorizeOrg({ kind: 'user', userId: 'a', isAdmin: true }, 'org.view', 'org_1', {
        orgId: 'org_1',
        role: 'OWNER',
      }),
    ).toThrow(ForbiddenError);
    expect(() => authorizeOrg({ kind: 'guest', eventId: 'e' }, 'org.view', 'org_1', null)).toThrow(ForbiddenError);
    expect(() => authorizeOrg({ kind: 'system' }, 'org.delete', 'org_1', null)).not.toThrow();
  });
});
