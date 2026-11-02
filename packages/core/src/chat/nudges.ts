import { prisma } from '@tiwa/db';

// Unread chat nudges (P13-T05, Backend.md §9a.5): push after 2 minutes
// unread, one email/WhatsApp summary after 15 minutes (max one per thread
// per hour). There is no SSE presence registry, so the operative condition
// is "read": clients with a live connection mark threads read on view,
// which suppresses the nudge naturally. Muted/archived threads never nudge.

export interface NudgeCandidate {
  threadId: string;
  userId: string;
  kind: 'push' | 'summary';
  unreadCount: number;
  senderName: string;
  snippet: string;
  url: string;
}

const PUSH_AFTER_MS = 2 * 60 * 1000;
const SUMMARY_AFTER_MS = 15 * 60 * 1000;
const SCAN_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function findNudgeCandidates(now: Date = new Date()): Promise<NudgeCandidate[]> {
  const since = new Date(now.getTime() - SCAN_WINDOW_MS);
  const participants = await prisma.threadParticipant.findMany({
    where: {
      leftAt: null,
      archivedAt: null,
      OR: [{ mutedUntil: null }, { mutedUntil: { lt: now } }],
      thread: { lastMessageAt: { gte: since, lte: new Date(now.getTime() - PUSH_AFTER_MS) } },
    },
    select: {
      threadId: true,
      userId: true,
      orgId: true,
      lastReadAt: true,
      thread: { select: { id: true, lastMessageAt: true } },
    },
    take: 1000,
  });
  const orgIds = [...new Set(participants.map((row) => row.orgId).filter((id): id is string => id !== null))];
  const memberships =
    orgIds.length > 0
      ? await prisma.membership.findMany({ where: { orgId: { in: orgIds } }, select: { orgId: true, userId: true } })
      : [];
  const membersByOrg = new Map<string, string[]>();
  for (const row of memberships) {
    const list = membersByOrg.get(row.orgId) ?? [];
    list.push(row.userId);
    membersByOrg.set(row.orgId, list);
  }
  const out: NudgeCandidate[] = [];
  for (const row of participants) {
    if (row.lastReadAt && row.thread.lastMessageAt && row.lastReadAt >= row.thread.lastMessageAt) continue;
    const userIds = row.userId !== null ? [row.userId] : row.orgId ? (membersByOrg.get(row.orgId) ?? []) : [];
    for (const userId of [...new Set(userIds)]) {
      const unread = await prisma.message.findMany({
        where: {
          threadId: row.threadId,
          deletedAt: null,
          authorUserId: { not: userId },
          createdAt: { gt: row.lastReadAt ?? new Date(0) },
        },
        orderBy: { createdAt: 'asc' },
        select: { body: true, maskedBody: true, authorUserId: true, createdAt: true },
      });
      if (unread.length === 0) continue;
      const oldest = unread[0]!.createdAt;
      const ageMs = now.getTime() - oldest.getTime();
      if (ageMs < PUSH_AFTER_MS) continue;
      const latest = unread[unread.length - 1]!;
      const author =
        latest.authorUserId === userId
          ? null
          : await prisma.user.findUnique({ where: { id: latest.authorUserId }, select: { name: true } });
      out.push({
        threadId: row.threadId,
        userId,
        kind: ageMs >= SUMMARY_AFTER_MS ? 'summary' : 'push',
        unreadCount: unread.length,
        senderName: author?.name ?? 'Someone',
        snippet: (latest.maskedBody ?? latest.body ?? '').slice(0, 100),
        url: `/inbox/${row.threadId}`,
      });
    }
  }
  return out;
}
