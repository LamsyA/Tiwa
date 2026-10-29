import { prisma, type OrgRole } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { ConflictError, ForbiddenError, ValidationError } from '../shared/errors.js';
import { inviteMember, listMembers, listMyOrgs, removeMember, updateMemberRole } from './members.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
let orgId = '';
const RUN = String(Date.now()).slice(-6);

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function join(actor: UserActor, role: OrgRole) {
  await prisma.membership.create({ data: { orgId, userId: actor.userId, role } });
}

let owner: UserActor;
let admin: UserActor;
let staff: UserActor;
let outsider: UserActor;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'Test Org', slug: `test-org-${RUN}`, countryCode: 'NG' },
  });
  orgId = org.id;
  owner = await makeUser('Owner');
  admin = await makeUser('Admin');
  staff = await makeUser('Staff');
  outsider = await makeUser('Outsider');
  await join(owner, 'OWNER');
  await join(admin, 'ADMIN');
  await join(staff, 'STAFF');
});

afterAll(async () => {
  const invited = await prisma.membership.findMany({ where: { orgId }, select: { userId: true } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { targetId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: [...users, ...invited.map((row) => row.userId)] } } });
  await prisma.$disconnect();
});

describe('inviteMember', () => {
  it('owner invites by national phone number: placeholder account, E.164, audit row', async () => {
    const result = await inviteMember(owner, { orgId, phone: `0803${RUN}1`.slice(0, 11), role: 'ADMIN' });
    expect(result).toMatchObject({ created: true, channel: 'sms', orgName: 'Test Org' });
    expect(result.to).toMatch(/^\+234803/);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user).toMatchObject({ phone: result.to, phoneNumber: result.to, phoneVerified: false });
    const auditRow = await prisma.auditLog.findFirst({ where: { targetId: orgId, action: 'org.member.invite' } });
    expect(auditRow?.actorId).toBe(owner.userId);
    expect(JSON.stringify(auditRow?.data)).not.toContain(result.to);
  });

  it('adds an existing account directly by email (case-insensitive)', async () => {
    const existing = await prisma.user.create({ data: { name: 'Ex', email: `ex${RUN}@example.com` } });
    users.push(existing.id);
    const result = await inviteMember(admin, { orgId, email: `EX${RUN}@Example.com `, role: 'STAFF' });
    expect(result).toMatchObject({ userId: existing.id, created: false, channel: 'email' });
  });

  it('refuses duplicates, bad numbers, and roles at or above your own', async () => {
    await expect(inviteMember(owner, { orgId, email: `ex${RUN}@example.com`, role: 'STAFF' })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(inviteMember(owner, { orgId, phone: '12', role: 'STAFF' })).rejects.toBeInstanceOf(ValidationError);
    await expect(inviteMember(admin, { orgId, email: `a${RUN}@example.com`, role: 'ADMIN' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('staff and outsiders cannot invite', async () => {
    await expect(inviteMember(staff, { orgId, email: `s${RUN}@example.com`, role: 'STAFF' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(inviteMember(outsider, { orgId, email: `o${RUN}@example.com`, role: 'STAFF' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('updateMemberRole', () => {
  it('owner promotes staff to admin and back', async () => {
    await updateMemberRole(owner, { orgId, userId: staff.userId, role: 'ADMIN' });
    expect((await listMembers(owner, orgId)).members.find((m) => m.userId === staff.userId)?.role).toBe('ADMIN');
    await updateMemberRole(owner, { orgId, userId: staff.userId, role: 'STAFF' });
  });

  it('admin cannot promote to admin or touch other admins/owner', async () => {
    await expect(updateMemberRole(admin, { orgId, userId: staff.userId, role: 'ADMIN' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(updateMemberRole(admin, { orgId, userId: owner.userId, role: 'STAFF' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('removeMember', () => {
  it('admin cannot remove the owner; the last owner cannot leave', async () => {
    await expect(removeMember(admin, { orgId, userId: owner.userId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeMember(owner, { orgId, userId: owner.userId })).rejects.toBeInstanceOf(ConflictError);
  });

  it('staff may leave; admin may remove staff', async () => {
    const extra = await makeUser('Extra');
    await join(extra, 'STAFF');
    await removeMember(admin, { orgId, userId: extra.userId });
    await removeMember(staff, { orgId, userId: staff.userId });
    const ids = (await listMembers(owner, orgId)).members.map((m) => m.userId);
    expect(ids).not.toContain(extra.userId);
    expect(ids).not.toContain(staff.userId);
  });
});

describe('listMembers / listMyOrgs', () => {
  it('members see the list with their role; outsiders are refused', async () => {
    const list = await listMembers(admin, orgId);
    expect(list.myRole).toBe('ADMIN');
    expect(list.members[0]?.role).toBe('OWNER');
    await expect(listMembers(outsider, orgId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lists my organisations', async () => {
    expect((await listMyOrgs(owner.userId)).map((row) => row.org.id)).toContain(orgId);
  });
});
