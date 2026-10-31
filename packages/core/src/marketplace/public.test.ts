import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { NotFoundError } from '../shared/errors.js';
import { savePackage } from './packages.js';
import { publishProfile, upsertBusinessProfile } from './profile.js';
import { getPublicProfile } from './public.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
let orgId = '';
let admin: UserActor;
const RUN = String(Date.now()).slice(-6);

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'Public Org', slug: `public-org-${RUN}`, city: 'Lagos', countryCode: 'NG' },
  });
  orgId = org.id;
  admin = await makeUser('PublicAdmin');
  await prisma.membership.create({ data: { orgId, userId: admin.userId, role: 'ADMIN' } });
  await upsertBusinessProfile(admin, {
    orgId,
    categories: ['photography'],
    bio: 'Great photos',
    city: 'Lagos',
    serviceAreaKm: 50,
    currency: 'NGN',
    allowGuestEnquiries: true,
  });
  await savePackage(admin, {
    orgId,
    name: 'Shoot',
    currency: 'NGN',
    priceMinor: '100000',
    includes: ['8 hours'],
    addOns: [],
    active: true,
  });
});

afterAll(async () => {
  await prisma.portfolioItem.deleteMany({ where: { orgId } });
  await prisma.servicePackage.deleteMany({ where: { orgId } });
  await prisma.businessProfile.deleteMany({ where: { orgId } });
  await prisma.businessVerification.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { targetId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('getPublicProfile', () => {
  it('404s until published, then returns the public shape with no contact details', async () => {
    const slug = `public-org-${RUN}`;
    await expect(getPublicProfile(slug, 'VENDOR')).rejects.toBeInstanceOf(NotFoundError);
    await prisma.portfolioItem.createMany({
      data: Array.from({ length: 6 }, (_, index) => ({ orgId, kind: 'PHOTO' as const, key: `pub${index}` })),
    });
    await publishProfile(admin, { orgId, published: true });
    const page = await getPublicProfile(slug, 'VENDOR');
    expect(page.org.name).toBe('Public Org');
    expect(page.profile.categoryLabels).toEqual(['Photography']);
    expect(page.packages).toHaveLength(1);
    expect(page.portfolio).toHaveLength(6);
    expect(page.verified).toBe(false);
    expect(JSON.stringify(page)).not.toMatch(/\+234|@example|phone|email/i);
    await expect(getPublicProfile(slug, 'PLANNER')).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPublicProfile('missing-slug', 'VENDOR')).rejects.toBeInstanceOf(NotFoundError);
  });
});
