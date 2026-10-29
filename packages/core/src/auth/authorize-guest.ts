import { ForbiddenError } from '../shared/errors.js';
import type { Action } from './actions.js';
import type { Actor, AuthResource } from './authorize.js';

/**
 * Guest capabilities (Backend.md §4.4). Guests carry no account: the invite
 * or ticket token identifies them for one event only.
 *
 * Allowed today: view the event, upload to the Guest album.
 * Everything else (RSVP scope, gallery privacy, post-event chat windows)
 * is enforced with data in P3/P4/P5/P13.
 */
const GUEST_ALLOWLIST: Action[] = ['event.view', 'moments.upload.guest'];

export function authorizeGuest(
  actor: Extract<Actor, { kind: 'guest' }>,
  action: Action,
  resource: AuthResource = {},
): void {
  if (resource.eventId !== undefined && resource.eventId !== actor.eventId) {
    throw new ForbiddenError(`Not allowed: ${action}`, { action, reason: 'wrong-event' });
  }
  if (GUEST_ALLOWLIST.includes(action)) return;
  throw new ForbiddenError(`Not allowed: ${action}`, { action, reason: 'guest-denied' });
}
