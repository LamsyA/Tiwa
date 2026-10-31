import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { ConflictError, ForbiddenError } from '../shared/errors.js';
import { archivePackage, savePackage } from './packages.js';
import { getChecklist, upsertBusinessProfile } from './profile.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
const orgs: string[] = [];
const RUN = String(Date.now()).slice(-6);

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeOrg(kind: 'VENDOR' | 'PLANNER', name: string) {
  const org = await prisma.organization.create({ data: { kind, name, slug: `${name}-${RUN}`, countryCode: 'NG' } });
  orgs.push(org.id);
  return org.id;
}

let owner: UserActor;
let staff: UserActor;
let outsider: UserActor;
let orgId = '';

beforeAll(async () => {
  orgId = await makeOrg('VENDOR', 'profile-org');
  owner = await makeUser('ProfOwner');
  staff = await makeUser('ProfStaff');
  outsider = await makeUser('ProfOut');
  await prisma.membership.createMany({
    data: [
      { orgId, userId: owner.userId, role: 'OWNER' },
      { orgId, userId: staff.userId, role: 'STAFF' },
    ],
  });
});

afterAll(async () => {
  for (const id of orgs) {
    await prisma.portfolioItem.deleteMany({ where: { orgId: id } });
    await prisma.servicePackage.deleteMany({ where: { orgId: id } });
    await prisma.businessProfile.deleteMany({ where: { orgId: id } });
    await prisma.businessVerification.deleteMany({ where: { orgId: id } });
    await prisma.membership.deleteMany({ where: { orgId: id } });
    await prisma.auditLog.deleteMany({ where: { targetId: id } });
    await prisma.organization.delete({ where: { id } });
  }
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

const profileInput = {
  orgId: '',
  categories: ['catering', 'cake'],
  bio: 'Lagos caterer',
  city: 'Lagos',
  serviceAreaKm: 50,
  currency: 'NGN',
  allowGuestEnquiries: true,
};

describe('upsertBusinessProfile', () => {
  it('owner creates a profile with trigram search text', async () => {
    const profile = await upsertBusinessProfile(owner, { ...profileInput, orgId });
    expect(profile.city).toBe('Lagos');
    expect(profile.searchText).toContain('Lagos caterer');
    expect(profile.searchText).toContain('Catering');
    const auditRow = await prisma.auditLog.findFirst({ where: { targetId: orgId, action: 'org.profile.upsert' } });
    expect(auditRow?.actorId).toBe(owner.userId);
  });

  it('rejects unknown categories and under-privileged actors', async () => {
    await expect(upsertBusinessProfile(owner, { ...profileInput, orgId, categories: ['nope'] })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(upsertBusinessProfile(staff, { ...profileInput, orgId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(upsertBusinessProfile(outsider, { ...profileInput, orgId })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('packages', () => {
  it('creates, updates and archives; cross-org ids are not found', async () => {
    const created = await savePackage(owner, {
      orgId,
      name: 'Full service',
      currency: 'NGN',
      priceMinor: '5000000',
      includes: [],
      addOns: [],
      active: true,
    });
    expect(created.priceMinor?.toString()).toBe('5000000');
    const other = await makeOrg('VENDOR', 'other-org');
    await expect(
      savePackage(owner, {
        orgId: other,
        packageId: created.id,
        name: 'X',
        currency: 'NGN',
        includes: [],
        addOns: [],
        active: true,
      }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      savePackage(staff, {
        orgId,
        packageId: created.id,
        name: 'X',
        currency: 'NGN',
        includes: [],
        addOns: [],
        active: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await archivePackage(owner, { orgId, packageId: created.id });
    const archived = await prisma.servicePackage.findUniqueOrThrow({ where: { id: created.id } });
    expect(archived.active).toBe(false);
  });
});

describe('getChecklist', () => {
  it('tracks profile → portfolio → packages toward publishable', async () => {
    const fresh = await makeOrg('VENDOR', 'check-org');
    await prisma.membership.create({ data: { orgId: fresh, userId: owner.userId, role: 'OWNER' } });
    let checklist = await getChecklist(owner, fresh);
    expect(checklist.publishable).toBe(false);
    await upsertBusinessProfile(owner, { ...profileInput, orgId: fresh });
    checklist = await getChecklist(owner, fresh);
    expect(checklist).toMatchObject({ profile: true, portfolio: false, packages: false, publishable: false });
    await prisma.portfolioItem.createMany({
      data: Array.from({ length: 6 }, (_, index) => ({
        orgId: fresh,
        kind: 'PHOTO' as const,
        key: `k${index}`,
        sortOrder: index,
      })),
    });
    await savePackage(owner, { orgId: fresh, name: 'Basic', currency: 'NGN', includes: [], addOns: [], active: true });
    checklist = await getChecklist(owner, fresh);
    expect(checklist).toMatchObject({ profile: true, portfolio: true, packages: true, publishable: true });
    expect(checklist).toMatchObject({ availability: false, bank: false, verification: 'NONE' });
  });
});
