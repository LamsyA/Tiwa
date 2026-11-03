import { prisma } from '@tiwa/db';
import { LimitReachedError } from '../shared/errors.js';

// AI token usage and daily caps (Backend.md §9.1, D-X42). Every model call
// writes one AiUsage row (no prompt text). Before a call, the actor's and the
// event's tokens since midnight UTC are checked against the configured caps.

export interface AiLimits {
  perUser: number;
  perEvent: number;
}

export interface AiUsageRow {
  feature: string;
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function startOfDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function tokensSince(where: { userId?: string; eventId?: string }, since: Date): Promise<number> {
  const sum = await prisma.aiUsage.aggregate({
    where: { ...where, createdAt: { gte: since } },
    _sum: { inputTokens: true, outputTokens: true },
  });
  return (sum._sum.inputTokens ?? 0) + (sum._sum.outputTokens ?? 0);
}

/** Throws when the user or the event has used today's AI allowance. */
export async function assertAiQuota(
  userId: string | null,
  eventId: string | null,
  limits: AiLimits,
  now = new Date(),
): Promise<void> {
  const since = startOfDay(now);
  const [mine, event] = await Promise.all([
    userId ? tokensSince({ userId }, since) : Promise.resolve(0),
    eventId ? tokensSince({ eventId }, since) : Promise.resolve(0),
  ]);
  if ((userId && mine >= limits.perUser) || (eventId && event >= limits.perEvent)) {
    throw new LimitReachedError('Daily AI limit reached — try again tomorrow', { key: 'aiDailyCap' });
  }
}

/** A usage hook for the AI client: logs each call against the user and event. */
export function aiUsageRecorder(userId: string | null, eventId: string | null) {
  return async (usage: AiUsageRow) => {
    await prisma.aiUsage.create({ data: { userId, eventId, ...usage } });
  };
}
