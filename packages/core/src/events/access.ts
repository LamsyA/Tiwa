import { prisma, type EventRole } from '@tiwa/db';
import type { Action } from '../auth/actions.js';
import { authorize, type Actor, type AuthResource, type EventAccess } from '../auth/authorize.js';
import { PRESETS, type ParticipantPermissions, type PresetName } from '../auth/presets.js';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

/** Permissions as stored on EventParticipant.permissions (JSON: the bigint cap is a string). */
export type StoredPermissions = Omit<ParticipantPermissions, 'approveUpToMinor'> & { approveUpToMinor: string | null };

export function toStoredPermissions(permissions: ParticipantPermissions): StoredPermissions {
  return {
    ...permissions,
    approveUpToMinor: permissions.approveUpToMinor === null ? null : permissions.approveUpToMinor.toString(),
  };
}

/** Parse stored JSON defensively: unknown or missing fields fall back to view-only (fail closed). */
export function fromStoredPermissions(raw: unknown): ParticipantPermissions {
  const base = PRESETS.view_only;
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<StoredPermissions>;
  const cap = value.approveUpToMinor;
  return {
    ...base,
    ...value,
    preset: typeof value.preset === 'string' ? value.preset : base.preset,
    approveUpToMinor: cap === null ? null : typeof cap === 'string' && /^\d+$/.test(cap) ? BigInt(cap) : 0n,
  } as ParticipantPermissions;
}

/** The host always holds every grant; members get their preset, adjusted by the host. */
export function permissionsFor(role: EventRole, preset: PresetName = 'view_only'): ParticipantPermissions {
  if (role === 'HOST') return { ...PRESETS.full, preset: 'host', membersManage: true };
  return { ...PRESETS[preset] };
}

/**
 * The actor's live access to an event: their non-removed participant row.
 * Loaded on every request, so removal takes effect on the next one (UF-04-3).
 */
export async function loadEventAccess(userId: string, eventId: string): Promise<EventAccess | null> {
  const row = await prisma.eventParticipant.findFirst({
    where: { eventId, userId, removedAt: null, event: { deletedAt: null } },
    orderBy: { createdAt: 'asc' },
    select: { role: true, permissions: true },
  });
  if (!row) return null;
  return { eventId, role: row.role, permissions: fromStoredPermissions(row.permissions) };
}

/**
 * Load access and authorize in one step. Non-members get NOT_FOUND so event
 * ids can't be probed; members without the right get FORBIDDEN.
 */
export async function requireEventAccess(
  actor: UserActor,
  eventId: string,
  action: Action,
  extra: Omit<AuthResource, 'eventId' | 'access'> = {},
): Promise<EventAccess> {
  const access = await loadEventAccess(actor.userId, eventId);
  if (!access) throw new NotFoundError('Event not found', { eventId });
  authorize(actor, action, { eventId, access, ...extra });
  return access;
}

/**
 * Authorize against access the caller already loaded this request (pages load
 * it once in `loadEventPage`, then thread it through read models — without
 * this, every list/overview re-queried the same participant row). Without a
 * preloaded row this is exactly `requireEventAccess`.
 */
export async function resolveEventAccess(
  actor: UserActor,
  eventId: string,
  action: Action,
  preloaded?: EventAccess,
): Promise<EventAccess> {
  if (!preloaded) return requireEventAccess(actor, eventId, action);
  authorize(actor, action, { eventId, access: preloaded });
  return preloaded;
}

/** Host-only commands (finalize, cancel, close) — the matrix has no grant for these. */
export function requireHost(access: EventAccess): void {
  if (access.role !== 'HOST') throw new ForbiddenError('Host only', { reason: 'host-only' });
}
