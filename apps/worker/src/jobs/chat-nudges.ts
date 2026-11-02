import { alreadyNotified, createLogger, findNudgeCandidates, notify, type NudgeCandidate } from '@tiwa/core';
import { prisma } from '@tiwa/db';

type Log = ReturnType<typeof createLogger>;

/** `chat/unread-nudges` (P13-T05, Backend.md §9a.5 + P6-T18): every minute,
 * push threads unread for 2+ minutes, and one email/WhatsApp summary per
 * thread per hour after 15 minutes. Keys dedupe across runs and replicas. */
export const CHAT_NUDGES_JOB = 'chat/unread-nudges' as const;
export const CHAT_NUDGES_EVERY_MS = 60 * 1000;

const SYSTEM = { kind: 'system' } as const;

function hourBucket(now: Date): string {
  return now.toISOString().slice(0, 13);
}

export async function handleChatNudges(
  log: Log,
  now = new Date(),
): Promise<{ push: number; summary: number; skipped: number }> {
  const candidates = await findNudgeCandidates(now);
  let push = 0;
  let summary = 0;
  let skipped = 0;
  for (const candidate of dedupeCandidates(candidates)) {
    const type = candidate.kind === 'push' ? 'chat.nudge' : 'chat.summary';
    const key = `${candidate.kind}:${candidate.threadId}:${candidate.userId}:${hourBucket(now)}`;
    if (await alreadyNotified(candidate.userId, type, key)) {
      skipped += 1;
      continue;
    }
    const exists = await prisma.user.findUnique({
      where: { id: candidate.userId },
      select: { id: true },
    });
    if (!exists) {
      // Participant outlived its user row (test cleanups) — nothing to tell.
      skipped += 1;
      continue;
    }
    const title =
      candidate.kind === 'push'
        ? candidate.senderName
        : `${candidate.unreadCount} new message${candidate.unreadCount === 1 ? '' : 's'}`;
    const body =
      candidate.kind === 'push'
        ? candidate.snippet || 'New message'
        : `${candidate.senderName} sent you ${candidate.unreadCount} message${candidate.unreadCount === 1 ? '' : 's'}`;
    await notify(SYSTEM, {
      userId: candidate.userId,
      type,
      title: title.slice(0, 200),
      body: body.slice(0, 1000),
      url: candidate.url,
      data: { threadId: candidate.threadId, kind: candidate.kind, key },
    });
    if (candidate.kind === 'push') push += 1;
    else summary += 1;
  }
  if (push + summary > 0 || candidates.length > 0) {
    log.info({ topic: CHAT_NUDGES_JOB, push, summary, skipped }, 'chat nudges fanned out');
  }
  return { push, summary, skipped };
}

/** One nudge per user per thread: prefer the strongest kind (summary > push). */
export function dedupeCandidates(candidates: NudgeCandidate[]): NudgeCandidate[] {
  const byThreadUser = new Map<string, NudgeCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.threadId}:${candidate.userId}`;
    const existing = byThreadUser.get(key);
    if (!existing || (existing.kind === 'push' && candidate.kind === 'summary')) {
      byThreadUser.set(key, candidate);
    }
  }
  return [...byThreadUser.values()];
}
