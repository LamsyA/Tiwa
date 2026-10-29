import { prisma, type OrgRole } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg, type OrgAction } from '../auth/org.js';
import { normaliseEmail, toE164 } from '../shared/contact.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';

// Organisation members (ACC-03, P2-T07). Invites go by phone or email: an
// existing account is added directly; otherwise a placeholder account is
// created with that contact, and the person signs in to it with OTP or a
// magic link (D-X07). Roles are ranked; you may only act on, and grant,
// roles strictly below your own. OWNER is never granted here.

const RANK: Record<OrgRole, number> = { OWNER: 3, ADMIN: 2, STAFF: 1 };

type UserActor = Extract<Actor, { kind: 'user' }>;

export const inviteMemberSchema = z
  .object({
    orgId: z.string().uuid(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    role: z.enum(['ADMIN', 'STAFF']),
  })
  .refine((value) => Boolean(value.phone) !== Boolean(value.email), { message: 'phoneOrEmail', path: ['phone'] });

export const updateMemberRoleSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['ADMIN', 'STAFF']),
});

export const removeMemberSchema = z.object({ orgId: z.string().uuid(), userId: z.string().uuid() });

async function loadAccess(actor: UserActor, orgId: string, action: OrgAction) {
  const membership = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } });
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
  return membership as NonNullable<typeof membership>;
}

function audit(actorId: string, action: string, orgId: string, data: Record<string, string>) {
  return prisma.auditLog.create({
    data: { actorId, actorType: 'user', action, targetType: 'Organization', targetId: orgId, data },
  });
}

export interface InviteResult {
  userId: string;
  /** True when a placeholder account was created for the contact. */
  created: boolean;
  channel: 'sms' | 'email';
  to: string;
  orgName: string;
}

export async function inviteMember(actor: UserActor, input: z.infer<typeof inviteMemberSchema>): Promise<InviteResult> {
  const mine = await loadAccess(actor, input.orgId, 'org.members.manage');
  if (RANK[input.role] >= RANK[mine.role]) {
    throw new ForbiddenError('Cannot grant this role', { reason: 'role-too-high', role: input.role });
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: input.orgId } });
  const phone = input.phone ? toE164(input.phone, org.countryCode) : undefined;
  const email = input.email ? normaliseEmail(input.email) : undefined;

  return prisma.$transaction(async (tx) => {
    let user: { id: string; deletedAt: Date | null } | null = await tx.user.findFirst({
      where: phone ? { phone } : { email: email as string },
      select: { id: true, deletedAt: true },
    });
    if (user?.deletedAt) throw new ValidationError('Account closed', { reason: 'account-deleted' });
    const created = !user;
    if (!user) {
      user = await tx.user.create({
        data: phone
          ? { name: '', phone, phoneNumber: phone, countryCode: org.countryCode }
          : { name: '', email: email as string, countryCode: org.countryCode },
        select: { id: true, deletedAt: true },
      });
    }
    const existing = await tx.membership.findUnique({ where: { orgId_userId: { orgId: org.id, userId: user.id } } });
    if (existing) throw new ConflictError('Already a member', { reason: 'already-member' });
    await tx.membership.create({ data: { orgId: org.id, userId: user.id, role: input.role } });
    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        actorType: 'user',
        action: 'org.member.invite',
        targetType: 'Organization',
        targetId: org.id,
        data: { userId: user.id, role: input.role, created },
      },
    });
    return {
      userId: user.id,
      created,
      channel: phone ? 'sms' : 'email',
      to: (phone ?? email) as string,
      orgName: org.name,
    };
  });
}

export async function updateMemberRole(actor: UserActor, input: z.infer<typeof updateMemberRoleSchema>): Promise<void> {
  const mine = await loadAccess(actor, input.orgId, 'org.members.manage');
  const target = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: input.orgId, userId: input.userId } },
  });
  if (!target) throw new NotFoundError();
  if (RANK[target.role] >= RANK[mine.role] || RANK[input.role] >= RANK[mine.role]) {
    throw new ForbiddenError('Cannot change this member', { reason: 'role-too-high' });
  }
  await prisma.membership.update({ where: { id: target.id }, data: { role: input.role } });
  await audit(actor.userId, 'org.member.role', input.orgId, {
    userId: input.userId,
    from: target.role,
    to: input.role,
  });
}

/** Remove a member (rank rule), or leave yourself — but an organisation always keeps one OWNER. */
export async function removeMember(actor: UserActor, input: z.infer<typeof removeMemberSchema>): Promise<void> {
  const leaving = input.userId === actor.userId;
  const mine = await loadAccess(actor, input.orgId, leaving ? 'org.view' : 'org.members.manage');
  const target = leaving
    ? mine
    : await prisma.membership.findUnique({ where: { orgId_userId: { orgId: input.orgId, userId: input.userId } } });
  if (!target) throw new NotFoundError();
  if (!leaving && RANK[target.role] >= RANK[mine.role]) {
    throw new ForbiddenError('Cannot remove this member', { reason: 'role-too-high' });
  }
  if (target.role === 'OWNER') {
    const owners = await prisma.membership.count({ where: { orgId: input.orgId, role: 'OWNER' } });
    if (owners <= 1) throw new ConflictError('Last owner', { reason: 'last-owner' });
  }
  await prisma.membership.delete({ where: { id: target.id } });
  await audit(actor.userId, leaving ? 'org.member.leave' : 'org.member.remove', input.orgId, { userId: input.userId });
}

export interface MemberRow {
  userId: string;
  name: string;
  contact: string | null;
  role: OrgRole;
  joined: boolean;
}

export async function listMembers(actor: UserActor, orgId: string): Promise<{ myRole: OrgRole; members: MemberRow[] }> {
  const mine = await loadAccess(actor, orgId, 'org.view');
  const rows = await prisma.membership.findMany({
    where: { orgId },
    include: {
      user: { select: { id: true, name: true, phone: true, email: true, phoneVerified: true, emailVerified: true } },
    },
    orderBy: [{ role: 'asc' }, { id: 'asc' }],
  });
  return {
    myRole: mine.role,
    members: rows.map((row) => ({
      userId: row.user.id,
      name: row.user.name,
      contact: row.user.phone ?? row.user.email,
      role: row.role,
      joined: row.user.phoneVerified || row.user.emailVerified,
    })),
  };
}

export async function listMyOrgs(userId: string) {
  return prisma.membership.findMany({
    where: { userId, org: { deletedAt: null } },
    select: { role: true, org: { select: { id: true, name: true, kind: true } } },
    orderBy: { id: 'asc' },
  });
}
