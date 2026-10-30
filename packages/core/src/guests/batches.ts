import { smsSegmentCostMinor } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { InvalidTransitionError, ValidationError } from '../shared/errors.js';
import { generateToken } from '../shared/ids.js';
import { withIdempotency } from '../shared/idempotency.js';
import { audit, enqueue } from '../shared/outbox.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

// Invite batches (UF-07): the host composes once (Who · How · Message),
// reviews per-channel counts + SMS estimate, and sends with one click.
// Delivery rows are created at compose time (DRAFT); `sendInviteBatch`
// flips the batch to QUEUED and fans out to the worker (P4-T07).

export const COMPOSER_CHANNELS = ['WHATSAPP', 'EMAIL', 'SMS', 'LINK'] as const;
export type ComposerChannel = (typeof COMPOSER_CHANNELS)[number];

const audienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('group'), groupId: z.string().uuid() }),
  z.object({ type: z.literal('ids'), guestIds: z.array(z.string().uuid()).min(1).max(5000) }),
  z.object({ type: z.literal('attending') }),
]);

export const createInviteBatchSchema = z.object({
  eventId: z.string().uuid(),
  audience: audienceSchema,
  channels: z.array(z.enum(COMPOSER_CHANNELS)).min(1).max(4),
  smart: z.boolean().default(true),
  message: z.string().trim().min(1).max(2000),
  kind: z.enum(['INVITE', 'UPDATE', 'REMINDER']).default('INVITE'),
});

export interface BatchPreview {
  batchId: string;
  counts: Record<ComposerChannel, number>;
  needsLink: { id: string; name: string; token: string }[];
  smsEstimateMinor: number;
  total: number;
}

interface AudienceGuest {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  inviteToken: string | null;
}

async function resolveAudience(
  eventId: string,
  audience: z.infer<typeof audienceSchema>,
  kind: string,
): Promise<AudienceGuest[]> {
  const base = { eventId, deletedAt: null };
  if (audience.type === 'group') {
    return prisma.guest.findMany({
      where: { ...base, groupIds: { has: audience.groupId } },
      select: { id: true, name: true, phone: true, email: true, inviteToken: true },
      orderBy: { name: 'asc' },
    });
  }
  if (audience.type === 'ids') {
    return prisma.guest.findMany({
      where: { ...base, id: { in: audience.guestIds } },
      select: { id: true, name: true, phone: true, email: true, inviteToken: true },
      orderBy: { name: 'asc' },
    });
  }
  if (audience.type === 'attending') {
    return prisma.guest.findMany({
      where: { ...base, rsvp: 'YES' },
      select: { id: true, name: true, phone: true, email: true, inviteToken: true },
      orderBy: { name: 'asc' },
    });
  }
  // "All guests not yet invited" (UF-07 step 2): no sent+ INVITE delivery yet.
  const guests = await prisma.guest.findMany({
    where: base,
    select: { id: true, name: true, phone: true, email: true, inviteToken: true },
    orderBy: { name: 'asc' },
  });
  if (kind !== 'INVITE' || guests.length === 0) return guests;
  const inviteBatches = await prisma.inviteBatch.findMany({
    where: { eventId, kind: 'INVITE' },
    select: { id: true },
  });
  if (inviteBatches.length === 0) return guests;
  const sent = await prisma.inviteDelivery.findMany({
    where: {
      batchId: { in: inviteBatches.map((batch) => batch.id) },
      guestId: { in: guests.map((guest) => guest.id) },
      status: { in: ['SENT', 'DELIVERED', 'OPENED', 'SENT_MANUALLY'] },
    },
    select: { guestId: true },
    distinct: ['guestId'],
  });
  const sentIds = new Set(sent.map((row) => row.guestId));
  return guests.filter((guest) => !sentIds.has(guest.id));
}

function pickChannel(guest: AudienceGuest, channels: ComposerChannel[], smart: boolean): ComposerChannel | null {
  const order = smart ? (['WHATSAPP', 'EMAIL', 'SMS', 'LINK'] as ComposerChannel[]) : channels;
  for (const channel of order) {
    if (!channels.includes(channel)) continue;
    if (channel === 'WHATSAPP' && guest.phone) return channel;
    if (channel === 'EMAIL' && guest.email) return channel;
    if (channel === 'SMS' && guest.phone) return channel;
    if (channel === 'LINK') return channel;
  }
  return null;
}

// Mirrors messaging's smsSegments for GSM-7/UCS-2 without the dependency
// (core must not import @tiwa/messaging — worker-only leaf).
function segments(text: string): number {
  if (text === '') return 0;
  // eslint-disable-next-line no-control-regex -- intentional ASCII-range check for GSM-7 billing
  const ascii = /^[\x00-\x7F]*$/.test(text);
  if (ascii) {
    if (text.length <= 160) return 1;
    return Math.ceil(text.length / 153);
  }
  const units = [...text].length;
  if (units <= 70) return 1;
  return Math.ceil(units / 67);
}

export async function createInviteBatch(
  actor: UserActor,
  input: z.infer<typeof createInviteBatchSchema>,
  preloaded?: EventAccess,
): Promise<BatchPreview> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    select: { invitesEnabled: true, countryCode: true },
  });
  if (!event.invitesEnabled) throw new InvalidTransitionError('Turn invitations on first', { key: 'invitesOff' });
  if (input.audience.type === 'group') {
    const group = await prisma.guestGroup.findFirst({
      where: { id: input.audience.groupId, eventId: input.eventId },
      select: { id: true },
    });
    if (!group) throw new ValidationError('Group not found', { field: 'audience', key: 'groupNotFound' });
  }

  const guests = await resolveAudience(input.eventId, input.audience, input.kind);
  const smart = input.smart ?? true;
  const plan = guests.map((guest) => ({ guest, channel: pickChannel(guest, input.channels, smart) }));
  const sendable = plan.filter((row) => row.channel !== null) as { guest: AudienceGuest; channel: ComposerChannel }[];
  if (sendable.length === 0 && plan.length === 0)
    throw new ValidationError('Nobody to send to', { key: 'emptyAudience' });

  const counts: Record<ComposerChannel, number> = { WHATSAPP: 0, EMAIL: 0, SMS: 0, LINK: 0 };
  for (const row of sendable) counts[row.channel] += 1;
  // Estimate with a sample personal link (tokens are fixed-length).
  const sampleLink = `https://tiwa.app/i/${'x'.repeat(43)}`;
  const renderedLength = input.message.length + 1 + sampleLink.length;
  const smsEstimateMinor = counts.SMS * segments('x'.repeat(renderedLength)) * smsSegmentCostMinor(event.countryCode);

  const preview = await prisma.$transaction(async (tx) => {
    const batch = await tx.inviteBatch.create({
      data: {
        eventId: input.eventId,
        createdById: actor.userId,
        channels: input.channels,
        smart,
        message: input.message,
        kind: input.kind,
        audience: JSON.parse(JSON.stringify(input.audience)),
        status: 'DRAFT',
      },
      select: { id: true },
    });
    // Personal tokens for every guest missing one (UF-07-2: unique per
    // guest) — including needs-link guests, so the host can copy their links.
    const tokens = new Map<string, string>();
    for (const row of plan) {
      if (row.guest.inviteToken) {
        tokens.set(row.guest.id, row.guest.inviteToken);
        continue;
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const token = generateToken(32);
        const clash = await tx.guest.findUnique({ where: { inviteToken: token }, select: { id: true } });
        if (!clash) {
          await tx.guest.update({ where: { id: row.guest.id }, data: { inviteToken: token } });
          tokens.set(row.guest.id, token);
          break;
        }
        if (attempt === 2) throw new Error('invite token collision');
      }
    }
    const withLinks = plan
      .filter((row) => row.channel === null)
      .map((row) => ({ id: row.guest.id, name: row.guest.name, token: tokens.get(row.guest.id) as string }));
    if (sendable.length > 0) {
      await tx.inviteDelivery.createMany({
        data: sendable.map((row) => ({
          guestId: row.guest.id,
          batchId: batch.id,
          channel: row.channel,
          status: 'QUEUED',
        })),
      });
    }
    await audit(tx, {
      actor,
      action: 'invites.createInviteBatch',
      targetType: 'InviteBatch',
      targetId: batch.id,
      data: { kind: input.kind, total: sendable.length },
    });
    return { batchId: batch.id, counts, needsLink: withLinks, smsEstimateMinor, total: sendable.length };
  });
  return preview;
}

export const sendInviteBatchSchema = z.object({
  batchId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(64),
});

/** The one click (UF-07-1): idempotent — replays return the original result. */
export async function sendInviteBatch(
  actor: UserActor,
  input: z.infer<typeof sendInviteBatchSchema>,
): Promise<{ batchId: string; queued: number; replayed: boolean }> {
  const batch = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: input.batchId } });
  await resolveEventAccess(actor, batch.eventId, 'guests.manage');
  // Replays return the stored result even though the batch is no longer DRAFT.
  const replay = await prisma.idempotencyKey.findUnique({ where: { key: `invite-batch:${input.idempotencyKey}` } });
  if (replay?.response) return { ...(replay.response as { batchId: string; queued: number }), replayed: true };
  if (batch.status !== 'DRAFT') {
    throw new InvalidTransitionError('This batch was already sent', { key: 'batchSent' });
  }
  return prisma.$transaction(async (tx) => {
    const { data, replayed } = await withIdempotency(tx, 'invite-batch', input.idempotencyKey, async () => {
      const updated = await tx.inviteBatch.update({
        where: { id: input.batchId, status: 'DRAFT' },
        data: { status: 'QUEUED', sentAt: new Date() },
        select: { id: true },
      });
      const queued = await tx.inviteDelivery.count({ where: { batchId: input.batchId, status: 'QUEUED' } });
      await enqueue(tx, 'invite.batch.queued', { batchId: input.batchId });
      await audit(tx, {
        actor,
        action: 'invites.sendInviteBatch',
        targetType: 'InviteBatch',
        targetId: input.batchId,
        data: { queued },
      });
      return { batchId: updated.id, queued };
    });
    return { ...data, replayed };
  });
}
