import { prisma } from '@tiwa/db';
import { authorize, type Actor } from '../auth/authorize.js';
import { loadEventAccess } from './access.js';
import { NotFoundError } from '../shared/errors.js';

// Event activity history (P13-T02): the audit trail scoped to one event,
// newest first. Money and payment entries stay hidden from members without
// `money.view` (same redaction as the money page).

type UserActor = Extract<Actor, { kind: 'user' }>;

const MONEY_PREFIXES = ['money.', 'payment.', 'payout', 'ledger.'];

export interface ActivityEntry {
  id: string;
  action: string;
  targetType: string;
  actorName: string | null;
  createdAt: Date;
}

export async function eventActivity(
  actor: UserActor,
  eventId: string,
  take = 30,
): Promise<{ entries: ActivityEntry[] }> {
  const access = await loadEventAccess(actor.userId, eventId);
  if (!access) throw new NotFoundError('Event not found');
  let canSeeMoney = true;
  try {
    authorize(actor, 'money.view', { eventId, access });
  } catch {
    canSeeMoney = false;
  }
  const rows = await prisma.auditLog.findMany({
    where: { data: { path: ['eventId'], equals: eventId } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const visible = rows.filter((row) => canSeeMoney || !MONEY_PREFIXES.some((prefix) => row.action.startsWith(prefix)));
  const userIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => id !== null))];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
  const names = new Map(users.map((row) => [row.id, row.name] as const));
  return {
    entries: visible.slice(0, take).map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.targetType,
      actorName: row.actorId ? (names.get(row.actorId) ?? '?') : 'System',
      createdAt: row.createdAt,
    })),
  };
}
