import { prisma } from '@tiwa/db';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';

// Team decisions on the event record (P13-T02, MSG-05/MSG-12). Messages
// flagged in the event-team thread surface on the overview and in activity.

type UserActor = Extract<Actor, { kind: 'user' }>;

export interface EventDecision {
  id: string;
  threadId: string;
  body: string | null;
  authorName: string | null;
  createdAt: Date;
}

/** Pinned decisions of one event, newest first. Members only. */
export async function eventDecisions(actor: UserActor, eventId: string, take = 20): Promise<EventDecision[]> {
  await requireEventAccess(actor, eventId, 'event.view');
  const thread = await prisma.thread.findFirst({
    where: { kind: 'EVENT', context: 'EVENT_TEAM', contextId: eventId },
    select: { id: true },
  });
  if (!thread) return [];
  const rows = await prisma.message.findMany({
    where: { threadId: thread.id, isDecision: true, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, threadId: true, body: true, authorUserId: true, createdAt: true },
  });
  const names = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((row) => row.authorUserId))] } },
        select: { id: true, name: true },
      })
    ).map((row) => [row.id, row.name] as const),
  );
  return rows.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    body: row.body,
    authorName: names.get(row.authorUserId) ?? null,
    createdAt: row.createdAt,
  }));
}
