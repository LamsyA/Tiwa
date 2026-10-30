import { prisma, type EventRole } from '@tiwa/db';
import { z } from 'zod';
import { authorize, type Actor, type EventAccess } from '../auth/authorize.js';
import { PRESETS, type PresetName } from '../auth/presets.js';
import { findOrCreateContactUser, normaliseEmail, toE164 } from '../shared/contact.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';
import { fromStoredPermissions, requireEventAccess, resolveEventAccess, toStoredPermissions } from './access.js';

// Event members (EVT-06, EVT-07, UF-04): co-hosts, planners and planner staff
// with a permission preset. Vendors and photographers join through bookings (P7).

type UserActor = Extract<Actor, { kind: 'user' }>;

const INVITABLE_ROLES = ['CO_HOST', 'PLANNER', 'PLANNER_STAFF'] as const;
const PRESET_NAMES = ['view_only', 'contributor', 'finance', 'full'] as const;

/** Approval cap in minor units as a digit string; null/omitted = no cap beyond the preset. */
const CAP = z
  .string()
  .regex(/^\d{1,15}$/, 'invalidAmount')
  .nullable()
  .optional();

export const addParticipantSchema = z
  .object({
    eventId: z.string().uuid(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    role: z.enum(INVITABLE_ROLES),
    preset: z.enum(PRESET_NAMES),
    approveUpToMinor: CAP,
  })
  .refine((value) => Boolean(value.phone) !== Boolean(value.email), { message: 'phoneOrEmail', path: ['phone'] });

export const updateParticipantSchema = z.object({
  eventId: z.string().uuid(),
  participantId: z.string().uuid(),
  preset: z.enum(PRESET_NAMES),
  approveUpToMinor: CAP,
});

export const removeParticipantSchema = z.object({ eventId: z.string().uuid(), participantId: z.string().uuid() });

/**
 * Preset + approval cap → stored permissions. Presets that can approve
 * (finance, full) take the host's cap; "unlimited" stays null (UF-04-2).
 */
function buildPermissions(preset: PresetName, cap: string | null | undefined) {
  const base = { ...PRESETS[preset] };
  if (base.approveUpToMinor !== 0n && cap !== undefined) base.approveUpToMinor = cap === null ? null : BigInt(cap);
  return toStoredPermissions(base);
}

export interface EventInviteResult {
  participantId: string;
  userId: string;
  created: boolean;
  channel: 'sms' | 'email';
  to: string;
  eventId: string;
  eventName: string;
}

export async function addParticipant(
  actor: UserActor,
  input: z.infer<typeof addParticipantSchema>,
): Promise<EventInviteResult> {
  await requireEventAccess(actor, input.eventId, 'event.members.manage');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    select: { id: true, name: true, countryCode: true },
  });
  const phone = input.phone ? toE164(input.phone, event.countryCode) : undefined;
  const email = input.email ? normaliseEmail(input.email) : undefined;

  return prisma.$transaction(async (tx) => {
    const { userId, created } = await findOrCreateContactUser(tx, { phone, email }, event.countryCode);
    const existing = await tx.eventParticipant.findFirst({ where: { eventId: event.id, userId, removedAt: null } });
    if (existing) throw new ConflictError('Already on this event', { reason: 'already-member' });
    const participant = await tx.eventParticipant.create({
      data: {
        eventId: event.id,
        userId,
        role: input.role,
        permissions: buildPermissions(input.preset, input.approveUpToMinor),
        invitedPhone: phone ?? null,
        invitedEmail: email ?? null,
      },
      select: { id: true },
    });
    await audit(tx, {
      actor,
      action: 'event.member.add',
      targetType: 'Event',
      targetId: event.id,
      data: { userId, role: input.role, preset: input.preset },
    });
    await enqueue(tx, 'event.members.changed', { eventId: event.id });
    return {
      participantId: participant.id,
      userId,
      created,
      channel: phone ? 'sms' : 'email',
      to: (phone ?? email) as string,
      eventId: event.id,
      eventName: event.name,
    };
  });
}

async function loadOther(eventId: string, participantId: string) {
  const row = await prisma.eventParticipant.findFirst({ where: { id: participantId, eventId, removedAt: null } });
  if (!row) throw new NotFoundError();
  // The host's own access is fixed; hosts change only through ownership transfer (not in the MVP).
  if (row.role === 'HOST') throw new ForbiddenError('Cannot change the host', { reason: 'host-fixed' });
  return row;
}

export async function updateParticipant(actor: UserActor, input: z.infer<typeof updateParticipantSchema>) {
  await requireEventAccess(actor, input.eventId, 'event.members.manage');
  const row = await loadOther(input.eventId, input.participantId);
  await prisma.$transaction(async (tx) => {
    await tx.eventParticipant.update({
      where: { id: row.id },
      data: { permissions: buildPermissions(input.preset, input.approveUpToMinor) },
    });
    await audit(tx, {
      actor,
      action: 'event.member.update',
      targetType: 'Event',
      targetId: input.eventId,
      data: { participantId: row.id, preset: input.preset },
    });
  });
}

/** Removal takes effect on the member's next request: access is loaded per request (UF-04-3). */
export async function removeParticipant(actor: UserActor, input: z.infer<typeof removeParticipantSchema>) {
  await requireEventAccess(actor, input.eventId, 'event.members.manage');
  const row = await loadOther(input.eventId, input.participantId);
  await prisma.$transaction(async (tx) => {
    await tx.eventParticipant.update({ where: { id: row.id }, data: { removedAt: new Date() } });
    await audit(tx, {
      actor,
      action: 'event.member.remove',
      targetType: 'Event',
      targetId: input.eventId,
      data: { participantId: row.id },
    });
    await enqueue(tx, 'event.members.changed', { eventId: input.eventId });
  });
}

export interface ParticipantRow {
  id: string;
  userId: string | null;
  name: string | null;
  contact: string | null;
  role: EventRole;
  preset: string;
  approveUpToMinor: string | null;
  joined: boolean;
}

export async function listParticipants(actor: UserActor, eventId: string, preloaded?: EventAccess) {
  const access = await resolveEventAccess(actor, eventId, 'event.view', preloaded);
  const rows = await prisma.eventParticipant.findMany({
    where: { eventId, removedAt: null, role: { in: ['HOST', ...INVITABLE_ROLES] } },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true, phone: true, email: true } } },
  });
  let canManage = true;
  try {
    authorize(actor, 'event.members.manage', { eventId, access });
  } catch {
    canManage = false;
  }
  return {
    canManage,
    myRole: access.role,
    members: rows.map((row): ParticipantRow => {
      const permissions = fromStoredPermissions(row.permissions);
      const name = row.user?.name && row.user.name !== row.user.phone ? row.user.name : null;
      return {
        id: row.id,
        userId: row.userId,
        name,
        // Contact details are only shown to people who manage the team.
        contact: canManage ? (row.user?.phone ?? row.user?.email ?? row.invitedPhone ?? row.invitedEmail) : null,
        role: row.role,
        preset: permissions.preset,
        approveUpToMinor: permissions.approveUpToMinor === null ? null : permissions.approveUpToMinor.toString(),
        joined: row.acceptedAt !== null,
      };
    }),
  };
}
