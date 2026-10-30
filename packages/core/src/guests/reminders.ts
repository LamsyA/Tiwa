import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import { createInviteBatch, sendInviteBatch } from './batches.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

// Reminders (Backend.md §10 `messaging/reminders`, GST cadence): non-responders
// get at most 2 reminders — one when the event is ~3 days out, one final
// nudge day-before. Each reminder is a REMINDER-kind InviteBatch created by
// the job and fanned out through the normal pipeline, so channels, rate
// limits and the tracking table all apply unchanged.

export const MAX_REMINDERS = 2;
/** First nudge when the event is within this window... */
export const FIRST_REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/** ...final nudge within this one (day-before). */
export const FINAL_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

export const setReminderPolicySchema = z.object({ eventId: z.string().uuid(), enabled: z.boolean() });

export async function setReminderPolicy(
  actor: UserActor,
  input: z.infer<typeof setReminderPolicySchema>,
  preloaded?: EventAccess,
): Promise<{ enabled: boolean }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: input.eventId }, data: { remindersEnabled: input.enabled } });
    await audit(tx, {
      actor,
      action: 'invites.setReminderPolicy',
      targetType: 'Event',
      targetId: input.eventId,
      data: { enabled: input.enabled },
    });
  });
  return { enabled: input.enabled };
}

export const toggleForwardingSchema = z.object({ eventId: z.string().uuid(), enabled: z.boolean() });

export async function toggleForwarding(
  actor: UserActor,
  input: z.infer<typeof toggleForwardingSchema>,
  preloaded?: EventAccess,
): Promise<{ enabled: boolean }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: input.eventId }, data: { allowForwarding: input.enabled } });
    await audit(tx, {
      actor,
      action: 'invites.toggleForwarding',
      targetType: 'Event',
      targetId: input.eventId,
      data: { enabled: input.enabled },
    });
  });
  return { enabled: input.enabled };
}

export interface ReminderCandidate {
  eventId: string;
  eventName: string;
  isFinal: boolean;
  guests: { id: string; remindersSent: number }[];
}

/**
 * Scan for due reminders (pure query — the worker calls this, then creates
 * one REMINDER batch per event through createInviteBatch so tokens,
 * channels and dedupe stay in one place).
 */
export async function findDueReminders(now = new Date()): Promise<ReminderCandidate[]> {
  const events = await prisma.event.findMany({
    where: {
      deletedAt: null,
      invitesEnabled: true,
      remindersEnabled: true,
      status: { in: ['DRAFT', 'ACTIVE'] },
      startsAt: { gt: now },
    },
    select: { id: true, name: true, startsAt: true },
  });
  const out: ReminderCandidate[] = [];
  for (const event of events) {
    if (!event.startsAt) continue;
    const msOut = event.startsAt.getTime() - now.getTime();
    const isFinal = msOut <= FINAL_REMINDER_WINDOW_MS;
    const isFirst = msOut <= FIRST_REMINDER_WINDOW_MS;
    if (!isFirst && !isFinal) continue;
    const guests = await prisma.guest.findMany({
      where: { eventId: event.id, deletedAt: null, rsvp: 'NONE', remindersSent: { lt: MAX_REMINDERS } },
      select: { id: true, remindersSent: true },
      orderBy: { id: 'asc' },
      take: 5000,
    });
    // Cadence: first nudge to guests with 0 sent; the final nudge goes to
    // anyone under the cap (late-created events skip the first window).
    const due = guests.filter((guest) => (isFinal ? guest.remindersSent <= 1 : guest.remindersSent === 0));
    if (due.length > 0) {
      out.push({
        eventId: event.id,
        eventName: event.name,
        isFinal,
        guests: due.map((guest) => ({ id: guest.id, remindersSent: guest.remindersSent })),
      });
    }
  }
  return out;
}

export const sendUpdateSchema = z.object({
  eventId: z.string().uuid(),
  audience: z.discriminatedUnion('type', [
    z.object({ type: z.literal('all') }),
    z.object({ type: z.literal('attending') }),
    z.object({ type: z.literal('group'), groupId: z.string().uuid() }),
    z.object({ type: z.literal('ids'), guestIds: z.array(z.string().uuid()).min(1).max(5000) }),
  ]),
  channels: z
    .array(z.enum(['WHATSAPP', 'EMAIL', 'SMS', 'LINK']))
    .min(1)
    .max(4),
  smart: z.boolean().default(true),
  message: z.string().trim().min(1).max(2000),
  idempotencyKey: z.string().min(8).max(64),
});

/**
 * Host update to all/attending/a group (GST-14): an UPDATE-kind batch
 * composed and sent in one call, idempotent like sendInviteBatch.
 */
export async function sendUpdate(
  actor: UserActor,
  input: z.infer<typeof sendUpdateSchema>,
): Promise<{ batchId: string; queued: number; replayed: boolean }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage');
  const preview = await createInviteBatch(actor, {
    eventId: input.eventId,
    audience: input.audience,
    channels: input.channels,
    smart: input.smart,
    message: input.message,
    kind: 'UPDATE',
  });
  if (preview.total === 0) throw new ValidationError('Nobody to send to', { key: 'emptyAudience' });
  return sendInviteBatch(actor, { batchId: preview.batchId, idempotencyKey: input.idempotencyKey });
}
