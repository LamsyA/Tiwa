import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize, type Actor, type EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { toE164 } from '../shared/contact.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
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

export const listBatchesSchema = z.object({ eventId: z.string().uuid() });

export interface InviteBatchRow {
  id: string;
  kind: string;
  status: string;
  channels: string[];
  total: number;
  sent: number;
  failed: number;
  createdAt: Date;
  sentAt: Date | null;
}

export async function listBatches(
  actor: UserActor,
  input: z.infer<typeof listBatchesSchema>,
  preloaded?: EventAccess,
): Promise<InviteBatchRow[]> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  // NOTE: InviteBatch has no deliveries relation (batchId is a plain
  // column); counts come from a grouped query.
  const rows = await prisma.inviteBatch.findMany({
    where: { eventId: input.eventId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  if (rows.length === 0) return [];
  const counts = await prisma.inviteDelivery.groupBy({
    by: ['batchId', 'status'],
    where: { batchId: { in: rows.map((row) => row.id) } },
    _count: { _all: true },
  });
  return rows.map((row) => {
    const mine = counts.filter((count) => count.batchId === row.id);
    const total = mine.reduce((sum, count) => sum + count._count._all, 0);
    const sent = mine
      .filter((count) => ['SENT', 'DELIVERED', 'OPENED', 'SENT_MANUALLY'].includes(count.status))
      .reduce((sum, count) => sum + count._count._all, 0);
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      channels: row.channels,
      total,
      sent,
      failed: mine.find((count) => count.status === 'FAILED')?._count._all ?? 0,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
    };
  });
}

export const batchDeliveriesSchema = z.object({ batchId: z.string().uuid() });

export interface DeliveryRow {
  id: string;
  guestId: string;
  guestName: string;
  contact: string | null;
  channel: string;
  status: string;
  error: string | null;
  rsvp: string;
}

/** Tracking table rows; contact redacted unless guests.contacts.view. */
export async function batchDeliveries(
  actor: UserActor,
  input: z.infer<typeof batchDeliveriesSchema>,
): Promise<{ eventId: string; status: string; kind: string; deliveries: DeliveryRow[] }> {
  const batch = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: input.batchId } });
  const access = await resolveEventAccess(actor, batch.eventId, 'guests.manage');
  let redacted = false;
  try {
    authorize(actor, 'guests.contacts.view', { eventId: batch.eventId, access });
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
    redacted = true;
  }
  const rows = await prisma.inviteDelivery.findMany({
    where: { batchId: input.batchId },
    orderBy: { guestId: 'asc' },
    take: 2000,
    include: { guest: { select: { id: true, name: true, phone: true, email: true, rsvp: true } } },
  });
  return {
    eventId: batch.eventId,
    status: batch.status,
    kind: batch.kind,
    deliveries: rows.map((row) => ({
      id: row.id,
      guestId: row.guest.id,
      guestName: row.guest.name,
      contact: redacted ? null : (row.guest.phone ?? row.guest.email),
      channel: row.channel,
      status: row.status,
      error: row.error,
      rsvp: row.guest.rsvp,
    })),
  };
}

// ───────────── Email one-tap RSVP links ─────────────
// `/i/{token}?r=yes|no&sig=…`: the page POSTs on load (scanners that only
// GET never record an answer — UF-08-3). The HMAC binds the response to the
// token so guests can't mint replies for other guests' links.

export type RsvpResponse = 'yes' | 'no';

export function signRsvp(token: string, response: RsvpResponse, secret: string): string {
  return createHmac('sha256', secret).update(`rsvp-v1:${token}:${response}`, 'utf8').digest('base64url');
}

export function verifyRsvp(token: string, response: string, sig: string, secret: string): response is RsvpResponse {
  if (response !== 'yes' && response !== 'no') return false;
  const expected = Buffer.from(signRsvp(token, response, secret), 'utf8');
  const actual = Buffer.from(sig, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function rsvpLink(appUrl: string, token: string, response: RsvpResponse, secret: string): string {
  return `${appUrl.replace(/\/$/, '')}/i/${token}?r=${response}&sig=${signRsvp(token, response, secret)}`;
}
