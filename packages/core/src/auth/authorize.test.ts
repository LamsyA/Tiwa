import { describe, expect, it } from 'vitest';
import type { Action } from './actions.js';
import { authorize, type Actor, type AuthResource } from './authorize.js';
import { PRESETS, type ParticipantPermissions } from './presets.js';
import type { EventRole } from './roles.js';
import { ForbiddenError } from '../shared/errors.js';

function access(role: EventRole, permissions: ParticipantPermissions, eventId = 'evt_1'): AuthResource {
  return { eventId, access: { eventId, role, permissions } };
}

function user(overrides: Partial<Extract<Actor, { kind: 'user' }>> = {}): Actor {
  return { kind: 'user', userId: 'u_1', isAdmin: false, ...overrides };
}

function allows(actor: Actor, action: Action, resource: AuthResource = {}): boolean {
  try {
    authorize(actor, action, resource);
    return true;
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenError);
    return false;
  }
}

describe('matrix: host', () => {
  const host = access('HOST', PRESETS.full);
  it('allows everything event-scoped except official-album upload and admin/org', () => {
    for (const action of [
      'event.view',
      'event.edit',
      'event.members.manage',
      'event.close',
      'money.view',
      'money.edit',
      'guests.manage',
      'tickets.manage',
      'checkin.scan',
      'runofshow.edit',
      'moments.moderate',
    ] as Action[]) {
      expect(allows(user(), action, host), action).toBe(true);
    }
    expect(allows(user(), 'moments.upload.official', host)).toBe(false);
    expect(allows(user(), 'admin.moderate', host)).toBe(false);
    expect(allows(user(), 'org.manage', host)).toBe(false);
  });
});

describe('matrix: grants and tiers', () => {
  it('co-host event.edit follows the eventEdit grant', () => {
    expect(allows(user(), 'event.edit', access('CO_HOST', { ...PRESETS.full, eventEdit: false }))).toBe(false);
    expect(allows(user(), 'event.edit', access('CO_HOST', { ...PRESETS.full, eventEdit: true }))).toBe(true);
  });

  it('money tiers gate view vs edit', () => {
    const view = access('CO_HOST', { ...PRESETS.view_only });
    expect(allows(user(), 'money.view', view)).toBe(false); // UF-04-1
    expect(allows(user(), 'money.edit', view)).toBe(false);
    const contributor = access('CO_HOST', { ...PRESETS.contributor });
    expect(allows(user(), 'money.view', contributor)).toBe(false);
    expect(allows(user(), 'event.edit', contributor)).toBe(true);
    expect(allows(user(), 'guests.manage', contributor)).toBe(true);
    const edit = access('CO_HOST', { ...PRESETS.finance });
    expect(allows(user(), 'money.edit', edit)).toBe(true);
  });

  it('planner members.manage follows the membersManage grant', () => {
    expect(allows(user(), 'event.members.manage', access('PLANNER', PRESETS.full))).toBe(false);
    expect(allows(user(), 'event.members.manage', access('PLANNER', { ...PRESETS.full, membersManage: true }))).toBe(
      true,
    );
  });

  it('vendor sees only their own booking', () => {
    const brief = access('VENDOR', PRESETS.view_only, 'evt_1');
    expect(allows(user(), 'event.view', { ...brief, isOwnBooking: true })).toBe(true);
    expect(allows(user(), 'event.view', { ...brief, isOwnBooking: false })).toBe(false);
    expect(allows(user(), 'event.view', brief)).toBe(false);
    expect(allows(user(), 'runofshow.updateOwn', { ...brief, isOwnBooking: true })).toBe(true);
    expect(allows(user(), 'moments.upload.guest', brief)).toBe(true);
    expect(allows(user(), 'moments.upload.official', { ...brief, isOwnBooking: true })).toBe(false);
  });

  it('photographer may publish to the Official album', () => {
    const photo = access('PHOTOGRAPHER', PRESETS.view_only);
    expect(allows(user(), 'moments.upload.official', photo)).toBe(true);
    expect(allows(user(), 'event.edit', photo)).toBe(false);
  });
});

describe('matrix: approveUpTo', () => {
  const capped = access('CO_HOST', { ...PRESETS.full, approveUpToMinor: 10_000_000n });
  it('allows at and below the cap', () => {
    expect(allows(user(), 'quote.accept', { ...capped, amountMinor: 10_000_000n })).toBe(true);
    expect(allows(user(), 'payment.make', { ...capped, amountMinor: 1n })).toBe(true);
  });
  it('denies above the cap and without an amount', () => {
    expect(allows(user(), 'quote.accept', { ...capped, amountMinor: 10_000_001n })).toBe(false);
    expect(allows(user(), 'quote.accept', capped)).toBe(false);
  });
  it('unlimited cap (null) allows any amount', () => {
    const unlimited = access('PLANNER', { ...PRESETS.full, approveUpToMinor: null });
    expect(allows(user(), 'quote.accept', { ...unlimited, amountMinor: 99_999_999_999n })).toBe(true);
  });
  it('planner staff can never approve', () => {
    const staff = access('PLANNER_STAFF', { ...PRESETS.full, approveUpToMinor: null });
    expect(allows(user(), 'quote.accept', { ...staff, amountMinor: 1n })).toBe(false);
  });
});

describe('authorize: actor kinds', () => {
  it('system allows everything', () => {
    expect(allows({ kind: 'system' }, 'event.close')).toBe(true);
    expect(allows({ kind: 'system' }, 'admin.setFlagOverride')).toBe(true);
  });

  it('admins may only use admin.*', () => {
    const admin = user({ isAdmin: true });
    expect(allows(admin, 'admin.suspendUser')).toBe(true);
    expect(allows(admin, 'admin.auditLog')).toBe(true);
    expect(allows(admin, 'event.view', access('HOST', PRESETS.full))).toBe(false);
    expect(allows(user(), 'admin.moderate')).toBe(false);
  });

  it('guests are allowlisted per event', () => {
    const guest: Actor = { kind: 'guest', guestId: 'g_1', eventId: 'evt_1' };
    expect(allows(guest, 'event.view', { eventId: 'evt_1' })).toBe(true);
    expect(allows(guest, 'moments.upload.guest', { eventId: 'evt_1' })).toBe(true);
    expect(allows(guest, 'event.view', { eventId: 'evt_2' })).toBe(false);
    expect(allows(guest, 'money.view', { eventId: 'evt_1' })).toBe(false);
    expect(allows(guest, 'event.close', { eventId: 'evt_1' })).toBe(false);
  });

  it('denies without participation, on wrong events, and unknown-adjacent actions', () => {
    expect(allows(user(), 'event.view', { eventId: 'evt_1' })).toBe(false);
    expect(allows(user(), 'event.view', access('HOST', PRESETS.full, 'evt_1'))).toBe(true);
    const other = access('HOST', PRESETS.full, 'evt_1');
    expect(allows(user(), 'event.view', { ...other, eventId: 'evt_2' })).toBe(false);
  });

  it('carries machine-readable denial details', () => {
    try {
      authorize(user(), 'event.close', access('CO_HOST', PRESETS.full));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).code).toBe('FORBIDDEN');
      expect((error as ForbiddenError).toJSON().code).toBe('FORBIDDEN');
    }
  });
});

describe('presets', () => {
  it('each preset resolves to a complete permission set', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(Object.values(preset).every((value) => value !== undefined)).toBe(true);
    }
  });

  it('view_only cannot approve money movement', () => {
    expect(allows(user(), 'quote.accept', { ...access('CO_HOST', PRESETS.view_only), amountMinor: 1n })).toBe(false);
  });
});
