import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import { requireParticipant } from './participants.js';

// Chat safety (Backend.md §9a.6): block a person or business, report a
// message for admin moderation (P16 queue). Blocks are checked by canMessage
// and at send time.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const blockPartySchema = z
  .object({
    userId: z.string().uuid().optional(),
    orgId: z.string().uuid().optional(),
    /** Block on behalf of one of my businesses (owners and admins). */
    asOrgId: z.string().uuid().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((value) => Boolean(value.userId) !== Boolean(value.orgId), { message: 'oneTarget', path: ['userId'] });

export const reportMessageSchema = z.object({
  messageId: z.string().uuid(),
  reason: z.string().trim().min(3, 'reasonTooShort').max(500, 'reasonTooLong'),
});

async function blocker(actor: UserActor, asOrgId: string | undefined) {
  if (!asOrgId) return { blockerUserId: actor.userId, blockerOrgId: null };
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: asOrgId, userId: actor.userId } },
  });
  authorizeOrg(actor, 'org.manage', asOrgId, membership ? { orgId: asOrgId, role: membership.role } : null);
  return { blockerUserId: null, blockerOrgId: asOrgId };
}

export async function blockParty(actor: UserActor, input: z.infer<typeof blockPartySchema>) {
  const who = await blocker(actor, input.asOrgId);
  if (input.userId && input.userId === actor.userId) {
    throw new ValidationError('Cannot block yourself', { field: 'userId', key: 'blockSelf' });
  }
  const target = { blockedUserId: input.userId ?? null, blockedOrgId: input.orgId ?? null };
  const existing = await prisma.userBlock.findFirst({ where: { ...who, ...target } });
  if (existing) return { blockId: existing.id };
  const block = await prisma.userBlock.create({ data: { ...who, ...target, reason: input.reason ?? null } });
  await audit(prisma, {
    actor,
    action: 'chat.block',
    targetType: input.orgId ? 'Organization' : 'User',
    targetId: (input.orgId ?? input.userId) as string,
  });
  return { blockId: block.id };
}

export async function unblockParty(actor: UserActor, input: z.infer<typeof blockPartySchema>) {
  const who = await blocker(actor, input.asOrgId);
  await prisma.userBlock.deleteMany({
    where: { ...who, blockedUserId: input.userId ?? null, blockedOrgId: input.orgId ?? null },
  });
}

/** Report a message: creates a Report for the moderation queue; the message stays visible to staff. */
export async function reportMessage(actor: UserActor, input: z.infer<typeof reportMessageSchema>) {
  const message = await prisma.message.findUnique({ where: { id: input.messageId } });
  if (!message) throw new NotFoundError('Message not found');
  await requireParticipant(actor, message.threadId);
  if (message.authorUserId === actor.userId) {
    throw new ForbiddenError('Cannot report your own message', { reason: 'own-message' });
  }
  const already = await prisma.report.findFirst({
    where: { targetType: 'message', targetId: message.id, reporterUserId: actor.userId },
  });
  if (already) return { reportId: already.id };
  const report = await prisma.report.create({
    data: { targetType: 'message', targetId: message.id, reason: input.reason, reporterUserId: actor.userId },
  });
  return { reportId: report.id };
}
