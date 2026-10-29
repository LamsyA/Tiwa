import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../shared/errors.js';
import { EXPORT_TOPIC, deleteMyAccount, requestDataExport, updateProfile, updateProfileSchema } from './settings.js';

const RUN = String(Date.now()).slice(-7);
const users: string[] = [];
const orgs: string[] = [];

async function makeUser(name: string, extra: { phone?: string; email?: string } = {}) {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG', ...extra } });
  users.push(user.id);
  return user;
}

async function makeOrg(members: { userId: string; role: 'OWNER' | 'ADMIN' | 'STAFF' }[]) {
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'Org', slug: `org-${RUN}-${orgs.length}`, countryCode: 'NG' },
  });
  orgs.push(org.id);
  await prisma.membership.createMany({ data: members.map((member) => ({ ...member, orgId: org.id })) });
  return org;
}

afterAll(async () => {
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.outboxEvent.deleteMany({
    where: { OR: users.map((id) => ({ payload: { path: ['userId'], equals: id } })) },
  });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('updateProfile', () => {
  it('saves name and locale; rejects unsupported locales', async () => {
    const user = await makeUser('Old');
    await updateProfile(user.id, { name: 'New Name', locale: 'en' });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: 'New Name',
      locale: 'en',
    });
    expect(updateProfileSchema.safeParse({ name: 'Ada', locale: 'xx' }).success).toBe(false);
  });
});

describe('requestDataExport', () => {
  it('queues one outbox job per 24 h', async () => {
    const user = await makeUser('Exporter');
    const first = await requestDataExport(user.id);
    const second = await requestDataExport(user.id);
    expect(first.repeat).toBe(false);
    expect(second).toEqual({ requestedAt: first.requestedAt, repeat: true });
    const rows = await prisma.outboxEvent.findMany({
      where: { topic: EXPORT_TOPIC, payload: { path: ['userId'], equals: user.id } },
    });
    expect(rows).toHaveLength(1);
    const later = await requestDataExport(user.id, new Date(Date.now() + 25 * 60 * 60 * 1000));
    expect(later.repeat).toBe(false);
  });
});

describe('deleteMyAccount', () => {
  it('anonymises the user, removes sessions and memberships, closes solo orgs, keeps the row', async () => {
    const user = await makeUser('Ada Lovelace', { phone: `+23480${RUN}1`, email: `ada${RUN}@example.com` });
    const solo = await makeOrg([{ userId: user.id, role: 'OWNER' }]);
    await prisma.session.create({
      data: { id: `s-${RUN}`, token: `t-${RUN}`, userId: user.id, expiresAt: new Date(Date.now() + 1e7) },
    });

    await deleteMyAccount(user.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after).toMatchObject({ name: '', email: null, phone: null, phoneNumber: null, image: null });
    expect(after.deletedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(0);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: solo.id } })).deletedAt).not.toBeNull();
    const auditRow = await prisma.auditLog.findFirst({ where: { targetId: user.id, action: 'account.delete' } });
    expect(JSON.stringify(auditRow)).not.toContain('Ada');
  });

  it('blocks deletion while I am the only owner of a team with other members', async () => {
    const owner = await makeUser('Owner');
    const staff = await makeUser('Staff');
    await makeOrg([
      { userId: owner.id, role: 'OWNER' },
      { userId: staff.id, role: 'STAFF' },
    ]);
    await expect(deleteMyAccount(owner.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).deletedAt).toBeNull();
  });

  it('allows deletion when another owner remains', async () => {
    const a = await makeUser('A');
    const b = await makeUser('B');
    const org = await makeOrg([
      { userId: a.id, role: 'OWNER' },
      { userId: b.id, role: 'OWNER' },
    ]);
    await deleteMyAccount(a.id);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).deletedAt).toBeNull();
    expect(await prisma.membership.count({ where: { orgId: org.id } })).toBe(1);
  });
});
