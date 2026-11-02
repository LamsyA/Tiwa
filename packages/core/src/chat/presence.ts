import { prisma } from '@tiwa/db';
import type { Actor } from '../auth/authorize.js';
import { requireParticipant } from './participants.js';

// Presence (D-X37): "online" / "last seen" in a chat. The open app refreshes
// User.lastSeenAt about every 20 s; someone counts as online for 60 s after
// that. A business side is online when any of its team is.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const ONLINE_WINDOW_MS = 60_000;

/** I'm here (called by the open app). */
export async function touchPresence(actor: UserActor, now = new Date()): Promise<void> {
  await prisma.user.update({ where: { id: actor.userId }, data: { lastSeenAt: now } });
}

export interface ThreadPresence {
  online: boolean;
  /** Most recent activity of the other side, or null if never seen. */
  lastSeenAt: string | null;
}

/** The other side of a thread: online now, or when they were last seen. Also marks me as here. */
export async function threadPresence(actor: UserActor, threadId: string, now = new Date()): Promise<ThreadPresence> {
  const me = await requireParticipant(actor, threadId);
  await touchPresence(actor, now);
  const others = await prisma.threadParticipant.findMany({
    where: { threadId, leftAt: null, NOT: { id: me.id } },
    select: { userId: true, orgId: true },
  });
  const orgIds = others.map((row) => row.orgId).filter((id): id is string => id !== null);
  const members = orgIds.length
    ? await prisma.membership.findMany({ where: { orgId: { in: orgIds } }, select: { userId: true } })
    : [];
  const userIds = [
    ...new Set(
      [...others.map((row) => row.userId), ...members.map((row) => row.userId)].filter(
        (id): id is string => id !== null && id !== actor.userId,
      ),
    ),
  ];
  if (userIds.length === 0) return { online: false, lastSeenAt: null };
  const latest = await prisma.user.aggregate({ where: { id: { in: userIds } }, _max: { lastSeenAt: true } });
  const seen = latest._max.lastSeenAt;
  return {
    online: Boolean(seen) && now.getTime() - seen!.getTime() < ONLINE_WINDOW_MS,
    lastSeenAt: seen ? seen.toISOString() : null,
  };
}
