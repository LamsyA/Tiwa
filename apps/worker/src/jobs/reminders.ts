import { createLogger, findDueReminders } from '@tiwa/core';
import { prisma } from '@tiwa/db';

type Log = ReturnType<typeof createLogger>;

/**
 * Backend.md §10 `messaging/reminders` (every 30 min): non-responders per
 * policy (max 2), day-before. Each due event gets one REMINDER batch through
 * the normal composer (tokens, smart routing, dedupe), which the fan-out
 * then sends; remindersSent increments when the batch is composed.
 */
export const REMINDERS_JOB = 'messaging/reminders' as const;
export const REMINDERS_EVERY_MS = 30 * 60 * 1000;

export async function handleReminders(log: Log, now = new Date()): Promise<{ batches: number; guests: number }> {
  const { createInviteBatch, sendInviteBatch } = await import('@tiwa/core');
  const due = await findDueReminders(now);
  let batches = 0;
  let guests = 0;
  for (const candidate of due) {
    // Sent on behalf of the host (they opted in via remindersEnabled), so
    // the audit trail attributes the batch to a real user.
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: candidate.eventId },
      select: { createdById: true },
    });
    const actor = { kind: 'user' as const, userId: event.createdById, isAdmin: false };
    const preview = await createInviteBatch(actor, {
      eventId: candidate.eventId,
      audience: { type: 'ids', guestIds: candidate.guests.map((guest) => guest.id) },
      channels: ['WHATSAPP', 'EMAIL', 'SMS'],
      smart: true,
      message: candidate.isFinal
        ? 'Final reminder: {event} is tomorrow! Tap your link to confirm: {link}'
        : 'A quick reminder: {event} is coming up. Tap your link to confirm: {link}',
      kind: 'REMINDER',
    });
    if (preview.total === 0) continue;
    const result = await sendInviteBatch(actor, {
      batchId: preview.batchId,
      idempotencyKey: `reminders:${candidate.eventId}:${candidate.isFinal ? 'final' : 'first'}:${now.toISOString().slice(0, 13)}`,
    });
    await prisma.guest.updateMany({
      where: { id: { in: candidate.guests.map((guest) => guest.id) } },
      data: { remindersSent: { increment: 1 } },
    });
    batches += 1;
    guests += result.queued;
    log.info(
      { topic: REMINDERS_JOB, eventId: candidate.eventId, final: candidate.isFinal, queued: result.queued },
      'reminder batch queued',
    );
  }
  return { batches, guests };
}
