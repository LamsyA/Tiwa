import { prisma } from '@tiwa/db';
import type { Actor } from '../auth/authorize.js';
import { loadEventAccess } from '../events/access.js';
import { NotFoundError } from '../shared/errors.js';

// Who may act in a thread. Its own module so threads.ts and attachments.ts can
// both use it without importing each other (the cycle broke production builds).

type UserActor = Extract<Actor, { kind: 'user' }>;

/** Participant rows the actor can act through in a thread: their own, or a business they belong to. */
async function myParticipantRows(actor: UserActor, threadId: string) {
  const orgIds = (await prisma.membership.findMany({ where: { userId: actor.userId }, select: { orgId: true } })).map(
    (row) => row.orgId,
  );
  return prisma.threadParticipant.findMany({
    where: {
      threadId,
      leftAt: null,
      OR: [{ userId: actor.userId, orgId: null }, ...(orgIds.length ? [{ orgId: { in: orgIds } }] : [])],
    },
  });
}

/** The row the actor speaks through; a personal row wins over a business row. */
export async function requireParticipant(actor: UserActor, threadId: string) {
  const rows = await myParticipantRows(actor, threadId);
  const row = rows.find((candidate) => !candidate.orgId) ?? rows[0] ?? (await joinBookingThread(actor, threadId));
  if (!row) throw new NotFoundError('Conversation not found', { threadId });
  return row;
}

const CLIENT_ROLES = new Set(['HOST', 'CO_HOST', 'PLANNER', 'PLANNER_STAFF']);

/** A booking chat starts with the event's creator only; the host, co-hosts and
 * planner team join it the first time they open it (D-X87). Someone who left
 * stays out. */
async function joinBookingThread(actor: UserActor, threadId: string) {
  const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { kind: true, eventId: true } });
  if (thread?.kind !== 'BOOKING' || !thread.eventId) return undefined;
  const access = await loadEventAccess(actor.userId, thread.eventId);
  if (!access || !CLIENT_ROLES.has(access.role)) return undefined;
  const left = await prisma.threadParticipant.findFirst({ where: { threadId, userId: actor.userId, orgId: null } });
  if (left) return undefined;
  return prisma.threadParticipant.create({
    data: { threadId, userId: actor.userId, side: 'CLIENT', lastReadAt: new Date() },
  });
}
