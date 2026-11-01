import { prisma, type ChatContext, type ChatSide, type Prisma } from '@tiwa/db';
import { z } from 'zod';
import { userIdSchema } from '../shared/schemas.js';
import type { Actor } from '../auth/authorize.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import {
  MAX_ATTACHMENTS,
  attachmentSchema,
  isImage,
  verifyAttachments,
  type AttachmentDeps,
  type StoredAttachment,
} from './attachments.js';
import { audit } from '../shared/outbox.js';
import { canMessage, type PartyKind } from './can-message.js';
import { MASKED_CONTEXTS, containsLink, scanContactInfo } from './masking.js';
import { requireParticipant } from './participants.js';
import { isBlocked, loadMessageFacts, orgParty, type Party } from './parties.js';

// Chat core (Backend.md §6, §9a; P6-T12). Threads hold participants (a person
// or a whole business); any member of a participating business reads and
// replies "on behalf of" it. Contact masking (P6-T16) and rate limits hook in
// at sendMessage.

type UserActor = Extract<Actor, { kind: 'user' }>;

const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const PAGE_SIZE = 50;

const SIDE: Record<PartyKind, ChatSide> = { CLIENT: 'CLIENT', PLANNER: 'PLANNER', VENDOR: 'VENDOR', GUEST: 'GUEST' };

/** Contexts a person (not a business) can start from, and the side they speak for. */
const DIRECT_CONTEXTS = [
  'PROFILE',
  'QUOTE_REQUEST',
  'QUOTE',
  'SITE_VISIT',
  'PLANNER_CLIENT',
  'PLANNER_VENDOR',
  'GUEST_ENQUIRY',
] as const;

const BODY = z.string().trim().min(1, 'emptyMessage').max(4000, 'messageTooLong');
const CLIENT_ID = z.string().min(8).max(64);

export const startThreadSchema = z
  .object({
    context: z.enum(DIRECT_CONTEXTS),
    contextId: z.string().max(64).optional(),
    toUserId: userIdSchema.optional(),
    toOrgId: z.string().uuid().optional(),
    /** Speak for one of my businesses instead of myself. */
    asOrgId: z.string().uuid().optional(),
    eventId: z.string().uuid().optional(),
    firstMessage: z.object({
      clientMessageId: CLIENT_ID,
      body: BODY,
      /** The sender saw the "contact details" warning and chose to send anyway (§9a.3). */
      acknowledgeContactWarning: z.boolean().optional(),
    }),
  })
  .refine((value) => Boolean(value.toUserId) !== Boolean(value.toOrgId), {
    message: 'oneRecipient',
    path: ['toUserId'],
  });

export const sendMessageSchema = z
  .object({
    threadId: z.string().uuid(),
    clientMessageId: CLIENT_ID,
    body: BODY.optional(),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS, 'tooManyAttachments').optional(),
    replyToId: z.string().uuid().optional(),
    mentions: z.array(userIdSchema).max(20).optional(),
    acknowledgeContactWarning: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.body) || Boolean(value.attachments?.length), {
    message: 'emptyMessage',
    path: ['body'],
  });

export const editMessageSchema = z.object({ messageId: z.string().uuid(), body: BODY });
export const messageIdSchema = z.object({ messageId: z.string().uuid() });
export const threadReceiptSchema = z.object({ threadId: z.string().uuid(), upToMessageId: z.string().uuid() });
export const muteThreadSchema = z.object({ threadId: z.string().uuid(), until: z.string().datetime().nullable() });
export const archiveThreadSchema = z.object({ threadId: z.string().uuid(), archived: z.boolean() });

/** The party the actor speaks as: a business they belong to, or themselves. */
async function senderParty(actor: UserActor, asOrgId: string | undefined, context: ChatContext): Promise<Party> {
  if (asOrgId) {
    const membership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: asOrgId, userId: actor.userId } },
    });
    if (!membership) throw new ForbiddenError('Not a member of that business', { reason: 'not-org-member' });
    return orgParty(prisma, asOrgId);
  }
  return { kind: context === 'GUEST_ENQUIRY' ? 'GUEST' : 'CLIENT', userId: actor.userId };
}

const participantWhere = (party: Party): Prisma.ThreadParticipantWhereInput =>
  party.orgId ? { orgId: party.orgId } : { userId: party.userId ?? null, orgId: null };

/**
 * A confirmed booking between the two parties lifts masking (§9a.3). Bookings
 * arrive in P7; until then no pair has one, so pre-booking threads stay masked.
 */
async function hasConfirmedBooking(_threadId: string): Promise<boolean> {
  return false;
}

/**
 * Contact-detail handling for one outgoing body. Throws `contactWarning` the
 * first time (the client shows the warning sheet); once acknowledged, stores
 * a masked copy for the other side and counts the attempt for trust & safety.
 */
async function contactFields(
  actor: UserActor,
  context: ChatContext,
  threadId: string | null,
  body: string | null | undefined,
  acknowledged: boolean | undefined,
): Promise<{ maskedBody: string | null; hasContactInfo: boolean }> {
  if (!body || !MASKED_CONTEXTS.has(context)) return { maskedBody: null, hasContactInfo: false };
  if (threadId && (await hasConfirmedBooking(threadId))) return { maskedBody: null, hasContactInfo: false };
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { countryCode: true } });
  const scan = scanContactInfo(body, user?.countryCode ?? 'NG');
  if (!scan.found) return { maskedBody: null, hasContactInfo: false };
  if (!acknowledged) throw new ValidationError('Contact details in message', { field: 'body', key: 'contactWarning' });
  await audit(prisma, { actor, action: 'chat.contact_shared', targetType: 'Thread', targetId: threadId ?? 'new' });
  return { maskedBody: scan.masked, hasContactInfo: true };
}

const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

/** Accounts younger than 7 days with no completed booking (bookings: P7) — §9a.6. */
export async function isNewAccount(userId: string, now = new Date()): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  return !user || now.getTime() - user.createdAt.getTime() < NEW_ACCOUNT_MS;
}

/**
 * Open a conversation (UF-30 steps 1–2). Reuses an existing DIRECT thread
 * between the same two parties about the same event instead of duplicating it.
 */
export async function startThread(actor: UserActor, input: z.infer<typeof startThreadSchema>) {
  const from = await senderParty(actor, input.asOrgId, input.context);
  const to: Party = input.toOrgId
    ? await orgParty(prisma, input.toOrgId)
    : { kind: 'CLIENT', userId: input.toUserId as string };
  if (to.userId && to.userId === actor.userId && !from.orgId) {
    throw new ValidationError('Cannot message yourself', { field: 'toUserId', key: 'messageSelf' });
  }
  const eventId = input.eventId ?? null;

  const existing = await prisma.thread.findFirst({
    where: {
      kind: 'DIRECT',
      eventId,
      AND: [{ participants: { some: participantWhere(from) } }, { participants: { some: participantWhere(to) } }],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const facts = await loadMessageFacts(prisma, from, to, eventId, existing?.id ?? null);
  const verdict = canMessage(from.kind, to.kind, facts);
  if (!verdict.allowed) throw new ForbiddenError('You cannot message this party', { reason: verdict.reason });

  if (existing) {
    const message = await sendMessage(actor, {
      threadId: existing.id,
      clientMessageId: input.firstMessage.clientMessageId,
      body: input.firstMessage.body,
      ...(input.firstMessage.acknowledgeContactWarning ? { acknowledgeContactWarning: true } : {}),
    });
    return { threadId: existing.id, messageId: message.messageId, reused: true };
  }

  // §9a.6: a new account's first message may not carry links (a review queue arrives in P16).
  if (containsLink(input.firstMessage.body) && (await isNewAccount(actor.userId))) {
    throw new ValidationError('Links are not allowed in a first message yet', {
      field: 'body',
      key: 'linkInFirstMessage',
    });
  }
  const contact = await contactFields(
    actor,
    input.context,
    null,
    input.firstMessage.body,
    input.firstMessage.acknowledgeContactWarning,
  );

  return prisma.$transaction(async (tx) => {
    const thread = await tx.thread.create({
      data: {
        kind: 'DIRECT',
        context: input.context,
        contextId: input.contextId ?? null,
        eventId,
        createdById: actor.userId,
        lastMessageAt: new Date(),
        participants: {
          create: [
            {
              ...(from.orgId ? { orgId: from.orgId } : { userId: from.userId ?? null }),
              side: SIDE[from.kind],
              lastReadAt: new Date(),
            },
            { ...(to.orgId ? { orgId: to.orgId } : { userId: to.userId ?? null }), side: SIDE[to.kind] },
          ],
        },
      },
      select: { id: true },
    });
    const message = await tx.message.create({
      data: {
        threadId: thread.id,
        authorUserId: actor.userId,
        authorOrgId: from.orgId ?? null,
        clientMessageId: input.firstMessage.clientMessageId,
        body: input.firstMessage.body,
        ...contact,
      },
      select: { id: true },
    });
    return { threadId: thread.id, messageId: message.id, reused: false };
  });
}

/** Blocks between the two parties of a DIRECT thread stop new messages (§9a.6). */
async function assertNotBlocked(threadId: string, mine: { id: string; userId: string | null; orgId: string | null }) {
  const others = await prisma.threadParticipant.findMany({ where: { threadId, leftAt: null, NOT: { id: mine.id } } });
  const party = (row: { userId: string | null; orgId: string | null }) =>
    row.orgId ? { orgId: row.orgId } : { userId: row.userId ?? '' };
  for (const other of others) {
    if (await isBlocked(prisma, party(mine), party(other))) {
      throw new ForbiddenError("You can't reply to this conversation", { reason: 'blocked' });
    }
  }
}

/** Idempotent on `clientMessageId`: a retry returns the message already stored (§9a.2). */
export async function sendMessage(actor: UserActor, input: z.infer<typeof sendMessageSchema>, deps?: AttachmentDeps) {
  const row = await requireParticipant(actor, input.threadId);
  const already = await prisma.message.findUnique({
    where: { threadId_clientMessageId: { threadId: input.threadId, clientMessageId: input.clientMessageId } },
    select: { id: true, authorUserId: true },
  });
  if (already) {
    if (already.authorUserId !== actor.userId)
      throw new ConflictError('Duplicate message id', { reason: 'client-id-taken' });
    return { messageId: already.id, duplicate: true };
  }
  const thread = await prisma.thread.findUniqueOrThrow({
    where: { id: input.threadId },
    select: { kind: true, eventId: true, context: true },
  });
  if (thread.kind === 'DIRECT') await assertNotBlocked(input.threadId, row);

  let mentions: string[] = [];
  if (input.mentions?.length && thread.kind === 'EVENT') {
    // Only people in the event-team thread can be mentioned.
    const members = await prisma.threadParticipant.findMany({
      where: { threadId: input.threadId, leftAt: null, userId: { in: input.mentions } },
      select: { userId: true },
    });
    mentions = members.map((member) => member.userId).filter((id): id is string => id !== null);
  }
  if (input.replyToId) {
    const target = await prisma.message.findFirst({ where: { id: input.replyToId, threadId: input.threadId } });
    if (!target)
      throw new ValidationError('Reply target not in this conversation', { field: 'replyToId', key: 'badReply' });
  }

  let attachments: StoredAttachment[] = [];
  if (input.attachments?.length) {
    if (!deps)
      throw new ValidationError('Attachments need storage', { field: 'attachments', key: 'attachmentMismatch' });
    attachments = await verifyAttachments(deps, input.threadId, input.attachments);
  }
  const kind = attachments.length === 0 ? 'TEXT' : attachments.every((a) => isImage(a.mime)) ? 'IMAGE' : 'FILE';
  const contact = await contactFields(
    actor,
    thread.context,
    input.threadId,
    input.body,
    input.acknowledgeContactWarning,
  );

  try {
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          threadId: input.threadId,
          authorUserId: actor.userId,
          authorOrgId: row.orgId,
          clientMessageId: input.clientMessageId,
          kind,
          body: input.body ?? null,
          ...contact,
          attachments: attachments.map((a) => ({ ...a })),
          replyToId: input.replyToId ?? null,
          mentions,
        },
        select: { id: true, createdAt: true },
      });
      await tx.thread.update({ where: { id: input.threadId }, data: { lastMessageAt: created.createdAt } });
      // Sending implies having read everything up to now; un-archive for the sender.
      await tx.threadParticipant.update({
        where: { id: row.id },
        data: { lastReadAt: created.createdAt, lastDeliveredAt: created.createdAt, archivedAt: null },
      });
      // A new message brings the thread back into everyone's inbox.
      await tx.threadParticipant.updateMany({
        where: { threadId: input.threadId, NOT: { id: row.id } },
        data: { archivedAt: null },
      });
      return created;
    });
    return { messageId: message.id, duplicate: false };
  } catch (error) {
    // Two concurrent retries: the unique index decides; return the winner.
    if ((error as { code?: string }).code === 'P2002') {
      const winner = await prisma.message.findUniqueOrThrow({
        where: { threadId_clientMessageId: { threadId: input.threadId, clientMessageId: input.clientMessageId } },
        select: { id: true },
      });
      return { messageId: winner.id, duplicate: true };
    }
    throw error;
  }
}

async function ownMessage(actor: UserActor, messageId: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.deletedAt) throw new NotFoundError('Message not found');
  await requireParticipant(actor, message.threadId);
  if (message.authorUserId !== actor.userId)
    throw new ForbiddenError('Only the author can do that', { reason: 'not-author' });
  return message;
}

/** Authors may edit within 15 minutes (§6). */
export async function editMessage(actor: UserActor, input: z.infer<typeof editMessageSchema>, now = new Date()) {
  const message = await ownMessage(actor, input.messageId);
  if (now.getTime() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new ForbiddenError('Edit window closed', { reason: 'edit-window' });
  }
  await prisma.message.update({ where: { id: message.id }, data: { body: input.body, editedAt: now } });
  return { threadId: message.threadId };
}

/** Soft delete: the bubble shows "This message was deleted". */
export async function deleteMessage(actor: UserActor, input: z.infer<typeof messageIdSchema>) {
  const message = await ownMessage(actor, input.messageId);
  await prisma.message.update({
    where: { id: message.id },
    data: { deletedAt: new Date(), body: null, maskedBody: null, attachments: [] },
  });
  return { threadId: message.threadId };
}

/** Receipts move forward only; a business's row covers the whole team (§9a.2). */
async function receipt(
  actor: UserActor,
  input: z.infer<typeof threadReceiptSchema>,
  field: 'lastReadAt' | 'lastDeliveredAt',
) {
  const row = await requireParticipant(actor, input.threadId);
  const message = await prisma.message.findFirst({
    where: { id: input.upToMessageId, threadId: input.threadId },
    select: { createdAt: true },
  });
  if (!message) throw new NotFoundError('Message not found');
  const current = row[field];
  if (!current || current < message.createdAt) {
    await prisma.threadParticipant.update({
      where: { id: row.id },
      data: {
        [field]: message.createdAt,
        // Reading implies delivery.
        ...(field === 'lastReadAt' && (!row.lastDeliveredAt || row.lastDeliveredAt < message.createdAt)
          ? { lastDeliveredAt: message.createdAt }
          : {}),
      },
    });
  }
  return { threadId: input.threadId, at: message.createdAt };
}

export const markRead = (actor: UserActor, input: z.infer<typeof threadReceiptSchema>) =>
  receipt(actor, input, 'lastReadAt');
export const markDelivered = (actor: UserActor, input: z.infer<typeof threadReceiptSchema>) =>
  receipt(actor, input, 'lastDeliveredAt');

export async function muteThread(actor: UserActor, input: z.infer<typeof muteThreadSchema>) {
  const row = await requireParticipant(actor, input.threadId);
  await prisma.threadParticipant.update({
    where: { id: row.id },
    data: { mutedUntil: input.until ? new Date(input.until) : null },
  });
}

export async function archiveThread(actor: UserActor, input: z.infer<typeof archiveThreadSchema>) {
  const row = await requireParticipant(actor, input.threadId);
  await prisma.threadParticipant.update({
    where: { id: row.id },
    data: { archivedAt: input.archived ? new Date() : null },
  });
}

/** Event-team members pin a message as a decision; it shows on the event overview (§6). */
export async function markDecision(
  actor: UserActor,
  input: z.infer<typeof messageIdSchema> & { decision?: boolean | undefined },
) {
  const message = await prisma.message.findUnique({ where: { id: input.messageId }, include: { thread: true } });
  if (!message || message.deletedAt) throw new NotFoundError('Message not found');
  if (message.thread.kind !== 'EVENT') throw new ValidationError('Only in event-team chats', { key: 'notEventThread' });
  await requireParticipant(actor, message.threadId);
  await prisma.message.update({ where: { id: message.id }, data: { isDecision: input.decision ?? true } });
  return { threadId: message.threadId, eventId: message.thread.eventId };
}

const TEAM_ROLES = ['HOST', 'CO_HOST', 'PLANNER', 'PLANNER_STAFF'] as const;

/**
 * Keep the event-team thread (EVENT_TEAM) in step with the event's members
 * (§9a.1, P6-T12). Idempotent: run on `event.finalized` and
 * `event.members.changed`. Removed members leave; returning members rejoin.
 */
export async function syncEventTeamThread(eventId: string): Promise<{ threadId: string; members: number }> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, createdById: true } });
    if (!event) throw new NotFoundError('Event not found', { eventId });
    const thread =
      (await tx.thread.findFirst({
        where: { kind: 'EVENT', context: 'EVENT_TEAM', contextId: eventId },
        select: { id: true },
      })) ??
      (await tx.thread.create({
        data: { kind: 'EVENT', context: 'EVENT_TEAM', contextId: eventId, eventId, createdById: event.createdById },
        select: { id: true },
      }));
    const members = await tx.eventParticipant.findMany({
      where: { eventId, removedAt: null, role: { in: [...TEAM_ROLES] }, userId: { not: null } },
      select: { userId: true },
    });
    const want = new Set(members.map((member) => member.userId as string));
    const rows = await tx.threadParticipant.findMany({ where: { threadId: thread.id, orgId: null } });
    for (const row of rows) {
      const shouldBeIn = row.userId !== null && want.has(row.userId);
      if (shouldBeIn && row.leftAt)
        await tx.threadParticipant.update({ where: { id: row.id }, data: { leftAt: null } });
      if (!shouldBeIn && !row.leftAt)
        await tx.threadParticipant.update({ where: { id: row.id }, data: { leftAt: new Date() } });
      if (row.userId) want.delete(row.userId);
    }
    if (want.size) {
      await tx.threadParticipant.createMany({
        data: [...want].map((userId) => ({ threadId: thread.id, userId, side: 'TEAM' as const })),
      });
    }
    return { threadId: thread.id, members: members.length };
  });
}

export { requireParticipant };
