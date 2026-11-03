import { assistantFromEnv, type Assistant } from '@tiwa/ai';
import { env } from '@tiwa/config';
import { aiUsageRecorder, assertAiQuota, authorize, isEnabled, type Action, type EventAccess } from '@tiwa/core';
import { prisma } from '@tiwa/db';

/**
 * The AI assistant for one request (D-X42): Meta Muse when `TIWA_MUSE_API` is
 * set, else the Fakes. Checks today's caps for the user and event first, and
 * logs every model call's tokens against them (Backend.md §9.1).
 */
export async function assistantFor(userId: string, eventId: string | null): Promise<Assistant> {
  await assertAiQuota(userId, eventId, {
    perUser: env.AI_DAILY_TOKENS_PER_USER,
    perEvent: env.AI_DAILY_TOKENS_PER_EVENT,
  });
  return assistantFromEnv(env, aiUsageRecorder(userId, eventId));
}

/** Show an AI button? Flag on for the event's country and the user may do `action` (UF-27-3). */
export async function aiAllowed(
  actor: { kind: 'user'; userId: string; isAdmin: boolean },
  eventId: string,
  access: EventAccess,
  action: Action,
): Promise<boolean> {
  try {
    authorize(actor, action, { eventId, access });
  } catch {
    return false;
  }
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { countryCode: true } });
  return event ? isEnabled('ai.enabled', event.countryCode).catch(() => false) : false;
}
