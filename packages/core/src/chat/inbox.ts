import { prisma, type ChatContext, type ThreadKind } from '@tiwa/db';
import type { Actor } from '../auth/authorize.js';
import { NotFoundError } from '../shared/errors.js';
import { requireParticipant } from './participants.js';
import { PAGE_SIZE } from './threads.js';

// Inbox read models (Backend.md §2 chat queries; P6-T12/T14).

type UserActor = Extract<Actor, { kind: 'user' }>;

export type InboxFilter = 'all' | 'unread' | 'enquiries' | 'bookings' | 'team';

const ENQUIRY_CONTEXTS: ChatContext[] = ['PROFILE', 'QUOTE_REQUEST', 'QUOTE', 'SITE_VISIT', 'GUEST_ENQUIRY'];

export interface InboxRow {
  threadId: string;
  kind: ThreadKind;
  context: ChatContext;
  eventId: string | null;
  eventName: string | null;
  /** Who the conversation is with, from my side. */
  title: string;
  /** Speaking for this business in the thread, if not myself. */
  asOrgId: string | null;
  lastMessage: { body: string | null; kind: string; deleted: boolean; mine: boolean; at: Date } | null;
  unread: number;
  muted: boolean;
  archived: boolean;
}

async function myOrgIds(userId: string): Promise<string[]> {
  return (await prisma.membership.findMany({ where: { userId }, select: { orgId: true } })).map((row) => row.orgId);
}

/** What the reader sees: the author and staff see the original; others the masked text (§9a.3). */
export function visibleBody(
  message: { body: string | null; maskedBody: string | null; authorUserId: string; deletedAt: Date | null },
  readerUserId: string,
): string | null {
  if (message.deletedAt) return null;
  if (message.authorUserId === readerUserId) return message.body;
  return message.maskedBody ?? message.body;
}

export async function listInbox(
  actor: UserActor,
  { filter = 'all', search, archived = false }: { filter?: InboxFilter; search?: string; archived?: boolean } = {},
): Promise<InboxRow[]> {
  const orgIds = await myOrgIds(actor.userId);
  const mine = await prisma.threadParticipant.findMany({
    where: {
      leftAt: null,
      archivedAt: archived ? { not: null } : null,
      OR: [{ userId: actor.userId, orgId: null }, ...(orgIds.length ? [{ orgId: { in: orgIds } }] : [])],
      thread: {
        ...(filter === 'enquiries' ? { context: { in: ENQUIRY_CONTEXTS } } : {}),
        ...(filter === 'bookings' ? { kind: 'BOOKING' as const } : {}),
        ...(filter === 'team' ? { kind: 'EVENT' as const } : {}),
      },
    },
    include: {
      thread: {
        include: {
          participants: {
            where: { leftAt: null },
            select: { id: true, userId: true, orgId: true, side: true },
          },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
    orderBy: { thread: { lastMessageAt: { sort: 'desc', nulls: 'last' } } },
    take: 200,
  });

  // A person can sit in a thread twice (themselves + their business); keep their personal row.
  const byThread = new Map<string, (typeof mine)[number]>();
  for (const row of mine) {
    const seen = byThread.get(row.threadId);
    if (!seen || (seen.orgId && !row.orgId)) byThread.set(row.threadId, row);
  }
  const rows = [...byThread.values()];

  // Names of the other parties and events, in two queries (no N+1).
  const otherUserIds = new Set<string>();
  const otherOrgIds = new Set<string>();
  const eventIds = new Set<string>();
  for (const row of rows) {
    if (row.thread.eventId) eventIds.add(row.thread.eventId);
    for (const p of row.thread.participants) {
      if (p.id === row.id) continue;
      if (p.orgId) otherOrgIds.add(p.orgId);
      else if (p.userId && p.userId !== actor.userId) otherUserIds.add(p.userId);
    }
  }
  const [users, orgs, events] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...otherUserIds] } }, select: { id: true, name: true, phone: true } }),
    prisma.organization.findMany({ where: { id: { in: [...otherOrgIds] } }, select: { id: true, name: true } }),
    prisma.event.findMany({ where: { id: { in: [...eventIds] } }, select: { id: true, name: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name && u.name !== u.phone ? u.name : '']));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const eventName = new Map(events.map((e) => [e.id, e.name]));

  const unreadCounts = await Promise.all(
    rows.map((row) =>
      prisma.message.count({
        where: {
          threadId: row.threadId,
          deletedAt: null,
          NOT: { authorUserId: actor.userId },
          ...(row.lastReadAt ? { createdAt: { gt: row.lastReadAt } } : {}),
        },
      }),
    ),
  );

  const now = new Date();
  const out = rows.map((row, index): InboxRow => {
    const thread = row.thread;
    const others = thread.participants.filter((p) => p.id !== row.id && p.userId !== actor.userId);
    const names = others.map((p) => (p.orgId ? orgName.get(p.orgId) : userName.get(p.userId ?? ''))).filter(Boolean);
    const last = thread.messages[0];
    return {
      threadId: thread.id,
      kind: thread.kind,
      context: thread.context,
      eventId: thread.eventId,
      eventName: thread.eventId ? (eventName.get(thread.eventId) ?? null) : null,
      title: thread.kind === 'EVENT' ? (eventName.get(thread.eventId ?? '') ?? '') : names.join(', '),
      asOrgId: row.orgId,
      lastMessage: last
        ? {
            body: visibleBody(last, actor.userId),
            kind: last.kind,
            deleted: last.deletedAt !== null,
            mine: last.authorUserId === actor.userId,
            at: last.createdAt,
          }
        : null,
      unread: unreadCounts[index] ?? 0,
      muted: row.mutedUntil !== null && row.mutedUntil > now,
      archived: row.archivedAt !== null,
    };
  });

  const needle = search?.trim().toLowerCase();
  return out.filter(
    (row) =>
      (filter !== 'unread' || row.unread > 0) &&
      (!needle ||
        row.title.toLowerCase().includes(needle) ||
        (row.eventName ?? '').toLowerCase().includes(needle) ||
        (row.lastMessage?.body ?? '').toLowerCase().includes(needle)),
  );
}

/**
 * Unread messages across the inbox, for the navigation badge (every page):
 * one SQL count over my participant rows, skipping muted and archived threads.
 */
export async function unreadTotal(actor: UserActor): Promise<number> {
  const orgIds = await myOrgIds(actor.userId);
  const rows = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(m.id)::bigint AS total
    FROM "ThreadParticipant" p
    JOIN "Message" m ON m."threadId" = p."threadId"
    WHERE p."leftAt" IS NULL
      AND p."archivedAt" IS NULL
      AND (p."mutedUntil" IS NULL OR p."mutedUntil" < now())
      AND ((p."userId" = ${actor.userId} AND p."orgId" IS NULL) OR p."orgId" = ANY(${orgIds}::text[]))
      AND m."deletedAt" IS NULL
      AND m."authorUserId" <> ${actor.userId}
      AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")`;
  return Number(rows[0]?.total ?? 0n);
}

export interface MessageView {
  id: string;
  clientMessageId: string;
  authorUserId: string;
  authorName: string | null;
  authorOrgId: string | null;
  mine: boolean;
  body: string | null;
  kind: string;
  /** Card payload for kind CARD: { type, id, ...snapshot } (P7-T12). */
  card: unknown;
  masked: boolean;
  deleted: boolean;
  edited: boolean;
  isDecision: boolean;
  replyToId: string | null;
  mentions: string[];
  /** Files on the message; fetched through the participant-checked attachment route. */
  attachments: { name: string; mime: string; sizeBytes: number }[];
  createdAt: Date;
}

/** Newest first, 50 per page; `before` is the oldest message id already shown (§9a.2). */
export async function listMessages(actor: UserActor, threadId: string, before?: string) {
  const row = await requireParticipant(actor, threadId);
  let cursorDate: Date | undefined;
  if (before) {
    const anchor = await prisma.message.findFirst({ where: { id: before, threadId }, select: { createdAt: true } });
    if (!anchor) throw new NotFoundError('Message not found');
    cursorDate = anchor.createdAt;
  }
  const messages = await prisma.message.findMany({
    where: { threadId, ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
  });
  const page = messages.slice(0, PAGE_SIZE);
  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(page.map((m) => m.authorUserId))] } },
    select: { id: true, name: true, phone: true },
  });
  const nameOf = new Map(authors.map((a) => [a.id, a.name && a.name !== a.phone ? a.name : null]));
  const others = await prisma.threadParticipant.findMany({
    where: { threadId, leftAt: null, NOT: { id: row.id } },
    select: { lastReadAt: true, lastDeliveredAt: true },
  });
  return {
    messages: page.map((m): MessageView => ({
      id: m.id,
      clientMessageId: m.clientMessageId,
      authorUserId: m.authorUserId,
      authorName: nameOf.get(m.authorUserId) ?? null,
      authorOrgId: m.authorOrgId,
      mine: m.authorUserId === actor.userId,
      body: visibleBody(m, actor.userId),
      kind: m.kind,
      card: m.kind === 'CARD' ? m.card : null,
      masked: m.authorUserId !== actor.userId && m.maskedBody !== null,
      deleted: m.deletedAt !== null,
      edited: m.editedAt !== null,
      isDecision: m.isDecision,
      replyToId: m.replyToId,
      mentions: m.mentions,
      // Keys stay server-side; the client asks for file N of a message.
      attachments: m.deletedAt
        ? []
        : (m.attachments as { name: string; mime: string; sizeBytes: number }[]).map(({ name, mime, sizeBytes }) => ({
            name,
            mime,
            sizeBytes,
          })),
      createdAt: m.createdAt,
    })),
    hasMore: messages.length > PAGE_SIZE,
    /** Furthest any other party has read / received — for ticks on my messages. */
    seenUpTo: others.reduce<Date | null>(
      (max, p) => (p.lastReadAt && (!max || p.lastReadAt > max) ? p.lastReadAt : max),
      null,
    ),
    deliveredUpTo: others.reduce<Date | null>(
      (max, p) => (p.lastDeliveredAt && (!max || p.lastDeliveredAt > max) ? p.lastDeliveredAt : max),
      null,
    ),
  };
}
