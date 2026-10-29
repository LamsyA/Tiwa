import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { ConflictError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';

const self = (userId: string) => ({ kind: 'user' as const, userId, isAdmin: false });

// Accounts module: settings (ACC-04, ACC-05, Backend.md §12 data rights).

/** Only languages with a full message catalog; more arrive with translations (P17+). */
export const SUPPORTED_LOCALES = ['en'] as const;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'nameTooShort').max(80, 'nameTooLong'),
  locale: z.enum(SUPPORTED_LOCALES),
});

export async function updateProfile(userId: string, input: z.infer<typeof updateProfileSchema>): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { name: input.name, locale: input.locale } });
}

export const EXPORT_TOPIC = 'account.export.requested';
const EXPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Queue "export my data" (job stub: the worker builds the ZIP in a later
 * phase). One request per 24 h; a repeat returns the pending request.
 */
export async function requestDataExport(
  userId: string,
  now = new Date(),
): Promise<{ requestedAt: Date; repeat: boolean }> {
  return prisma.$transaction(async (tx) => {
    const recent = await tx.outboxEvent.findFirst({
      where: {
        topic: EXPORT_TOPIC,
        createdAt: { gte: new Date(now.getTime() - EXPORT_COOLDOWN_MS) },
        payload: { path: ['userId'], equals: userId },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) return { requestedAt: recent.createdAt, repeat: true };
    const event = await enqueue(tx, EXPORT_TOPIC, { userId });
    await audit(tx, { actor: self(userId), action: 'account.export', targetType: 'User', targetId: userId });
    return { requestedAt: event.createdAt, repeat: false };
  });
}

export const deleteAccountSchema = z.object({ confirm: z.literal(true) });

/**
 * Delete my account by anonymising it (Backend.md §12): contact details,
 * name and photo are cleared, sessions and sign-in methods removed, the row
 * kept so ledger/audit references stay valid. Businesses where I am the only
 * member are closed; businesses where I am the only OWNER but others remain
 * block deletion until ownership moves (CONFLICT). Uploaded media is removed
 * by the `account.deleted` outbox consumer when Moments lands (P5).
 */
export async function deleteMyAccount(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const memberships = await tx.membership.findMany({
      where: { userId },
      include: { org: { include: { members: { select: { userId: true, role: true } } } } },
    });
    for (const membership of memberships) {
      const others = membership.org.members.filter((member) => member.userId !== userId);
      const otherOwners = others.filter((member) => member.role === 'OWNER');
      if (membership.role === 'OWNER' && others.length > 0 && otherOwners.length === 0) {
        throw new ConflictError('Transfer ownership first', { reason: 'sole-owner', orgId: membership.orgId });
      }
    }
    const closing = memberships.filter((membership) => membership.org.members.length === 1).map((m) => m.orgId);
    if (closing.length) {
      await tx.organization.updateMany({ where: { id: { in: closing } }, data: { deletedAt: new Date() } });
    }
    await tx.membership.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        name: '',
        email: null,
        emailVerified: false,
        phone: null,
        phoneVerified: false,
        phoneNumber: null,
        phoneNumberVerified: false,
        image: null,
        deletedAt: new Date(),
      },
    });
    await audit(tx, {
      actor: self(userId),
      action: 'account.delete',
      targetType: 'User',
      targetId: userId,
      data: { closedOrgs: closing },
    });
    await enqueue(tx, 'account.deleted', { userId });
  });
}
