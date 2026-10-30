import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { toE164 } from '../shared/contact.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { generateToken } from '../shared/ids.js';
import { audit } from '../shared/outbox.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

// Invitations (GST-04…): off by default per event; the host opts in. Batch
// composing/sending lands in P4-T06/T07; this file holds the switches and
// the public shared-link RSVP.

export const enableInvitesSchema = z.object({ eventId: z.string().uuid(), enabled: z.boolean() });

export async function enableInvites(
  actor: UserActor,
  input: z.infer<typeof enableInvitesSchema>,
  preloaded?: EventAccess,
): Promise<{ enabled: boolean }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: input.eventId }, data: { invitesEnabled: input.enabled } });
    await audit(tx, {
      actor,
      action: 'invites.enableInvites',
      targetType: 'Event',
      targetId: input.eventId,
      data: { enabled: input.enabled },
    });
  });
  return { enabled: input.enabled };
}

export const toggleSharedLinkSchema = z.object({ eventId: z.string().uuid(), enabled: z.boolean() });

export async function toggleSharedLink(
  actor: UserActor,
  input: z.infer<typeof toggleSharedLinkSchema>,
  preloaded?: EventAccess,
): Promise<{ enabled: boolean }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: input.eventId }, data: { sharedLinkEnabled: input.enabled } });
    await audit(tx, {
      actor,
      action: 'invites.toggleSharedLink',
      targetType: 'Event',
      targetId: input.eventId,
      data: { enabled: input.enabled },
    });
  });
  return { enabled: input.enabled };
}

export const sharedLinkRsvpSchema = z.object({
  eventSlug: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(32).optional(),
});

/**
 * UF-09: anyone with the shared link RSVPs with a name (phone optional);
 * Tiwa creates a Guest with source SHARED_LINK and an immediate YES.
 * No account. Rate-limited per IP at the route (Backend.md §13 family).
 */
export async function sharedLinkRsvp(input: z.infer<typeof sharedLinkRsvpSchema>): Promise<{ guestId: string }> {
  const event = await prisma.event.findFirst({
    where: { slug: input.eventSlug, deletedAt: null },
    select: { id: true, status: true, sharedLinkEnabled: true, countryCode: true },
  });
  if (!event || event.status === 'CANCELLED' || event.status === 'COMPLETED') {
    throw new NotFoundError('Event not found', { slug: input.eventSlug });
  }
  if (!event.sharedLinkEnabled) throw new ConflictError('RSVP is closed for this event', { key: 'rsvpClosed' });
  let phone: string | null = null;
  if (input.phone) {
    try {
      phone = toE164(input.phone, event.countryCode);
    } catch {
      throw new ValidationError('Invalid phone number', { field: 'phone', key: 'invalidPhone' });
    }
  }
  const guest = await prisma.$transaction(async (tx) => {
    const created = await tx.guest.create({
      data: {
        eventId: event.id,
        name: input.name,
        phone,
        source: 'SHARED_LINK',
        rsvp: 'YES',
        respondedAt: new Date(),
        inviteToken: generateToken(32),
      },
      select: { id: true },
    });
    await audit(tx, {
      actor: { kind: 'guest', guestId: created.id, eventId: event.id },
      action: 'invites.sharedLinkRsvp',
      targetType: 'Guest',
      targetId: created.id,
      data: {},
    });
    return created;
  });
  return { guestId: guest.id };
}
