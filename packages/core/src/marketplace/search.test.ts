import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { savePackage } from './packages.js';
import { blockAvailability } from './availability.js';
import { publishProfile, upsertBusinessProfile } from './profile.js';
import { searchMarketplace } from './search.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
const orgIds: string[] = [];
const RUN = String(Date.now()).slice(-6);

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

let admin: UserActor;

async function makePublished(
  kind: 'VENDOR' | 'PLANNER',
  tag: string,
  city: string,
  rating: number | null,
  price?: string,
) {
  const org = await prisma.organization.create({
    data: {
      kind,
      name: `${tag} ${RUN}`,
      slug: `${tag.toLowerCase()}-${RUN}`,
      city,
      countryCode: 'NG',
      verification: 'APPROVED',
    },
  });
  orgIds.push(org.id);
  await prisma.membership.create({ data: { orgId: org.id, userId: admin.userId, role: 'ADMIN' } });
  await upsertBusinessProfile(admin, {
    orgId: org.id,
    categories: ['photography'],
    city,
    serviceAreaKm: 50,
    currency: 'NGN',
    startingPriceMinor: price,
    allowGuestEnquiries: true,
  });
  await prisma.portfolioItem.createMany({
    data: Array.from({ length: 6 }, (_, index) => ({ orgId: org.id, kind: 'PHOTO' as const, key: `s${index}` })),
  });
  await savePackage(admin, { orgId: org.id, name: 'Shoot', currency: 'NGN', includes: [], addOns: [], active: true });
  await publishProfile(admin, { orgId: org.id, published: true });
  if (rating !== null) {
    await prisma.businessProfile.update({ where: { orgId: org.id }, data: { ratingAvg: rating, ratingCount: 6 } });
  }
  return org.id;
}

beforeAll(async () => {
  admin = await makeUser('SearchAdmin');
});

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.portfolioItem.deleteMany({ where: { orgId } });
    await prisma.servicePackage.deleteMany({ where: { orgId } });
    await prisma.availabilityBlock.deleteMany({ where: { orgId } });
    await prisma.businessProfile.deleteMany({ where: { orgId } });
    await prisma.businessVerification.deleteMany({ where: { orgId } });
    await prisma.membership.deleteMany({ where: { orgId } });
    await prisma.auditLog.deleteMany({ where: { targetId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('searchMarketplace', () => {
  it('filters by kind, city, price, rating and verified; sorts and paginates', async () => {
    const lagos = await makePublished('VENDOR', 'SearchLagos', 'Lagos', 4.5, '100000');
    await makePublished('VENDOR', 'SearchAbuja', 'Abuja', 3.0, '50000');
    await makePublished('PLANNER', 'SearchPlanner', 'Lagos', 5.0, '200000');
    const tag = `SearchLagos ${RUN}`;

    const vendors = await searchMarketplace(admin, { kind: 'VENDOR', q: tag, verifiedOnly: true });
    expect(vendors.hits.length).toBeGreaterThanOrEqual(1);
    expect(vendors.hits.every((hit) => hit.verified)).toBe(true);

    const lagosOnly = await searchMarketplace(admin, { kind: 'VENDOR', q: tag, city: 'lag' });
    expect(lagosOnly.hits.map((hit) => hit.orgId)).toContain(lagos);

    const pricey = await searchMarketplace(admin, { kind: 'VENDOR', q: tag, minPriceMinor: '90000', sort: 'priceAsc' });
    expect(pricey.hits[0]?.startingPriceMinor).toBe('100000');

    const ratedMiss = await searchMarketplace(admin, { kind: 'VENDOR', q: `SearchAbuja ${RUN}`, minRating: 4 });
    expect(ratedMiss.hits).toHaveLength(0);
    const rated = await searchMarketplace(admin, { kind: 'VENDOR', q: tag, minRating: 4 });
    expect(rated.hits.every((hit) => (hit.ratingAvg ?? 0) >= 4)).toBe(true);

    const planners = await searchMarketplace(admin, { kind: 'PLANNER', q: `SearchPlanner ${RUN}` });
    expect(planners.hits.some((hit) => hit.categories.includes('photography'))).toBe(true);

    const first = await searchMarketplace(admin, { kind: 'VENDOR', q: 'Search', take: 1, sort: 'rating' });
    expect(first.nextCursor).not.toBeNull();
    const second = await searchMarketplace(admin, {
      kind: 'VENDOR',
      q: 'Search',
      take: 1,
      sort: 'rating',
      cursor: first.nextCursor!,
    });
    expect(second.hits[0]?.orgId).not.toBe(first.hits[0]?.orgId);
  });

  it('excludes vendors blocked on the requested date', async () => {
    const blocked = await makePublished('VENDOR', 'SearchBlocked', 'Lagos', null, '70000');
    await blockAvailability(admin, { orgId: blocked, date: '2027-06-01', reason: 'Busy' });
    const tag = `SearchBlocked ${RUN}`;
    const free = await searchMarketplace(admin, { kind: 'VENDOR', q: tag, freeOn: '2027-06-01' });
    expect(free.hits.map((hit) => hit.orgId)).not.toContain(blocked);
    const anyDay = await searchMarketplace(admin, { kind: 'VENDOR', q: tag, freeOn: '2027-06-02' });
    expect(anyDay.hits.map((hit) => hit.orgId)).toContain(blocked);
  });
});
