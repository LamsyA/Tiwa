import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { blockAvailability } from './availability.js';
import { upsertBusinessProfile } from './profile.js';
import { saveSpace } from './spaces.js';
import { searchVenues } from './venues.js';

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
let venueOrgId = '';

async function makeVenue(tag: string, city: string, capacity: number, price?: string) {
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: `${tag} ${RUN}`, slug: `${tag.toLowerCase()}-${RUN}`, city, countryCode: 'NG' },
  });
  orgIds.push(org.id);
  await prisma.membership.create({ data: { orgId: org.id, userId: admin.userId, role: 'ADMIN' } });
  await upsertBusinessProfile(admin, {
    orgId: org.id,
    categories: ['venue'],
    city,
    serviceAreaKm: 50,
    currency: 'NGN',
    allowGuestEnquiries: true,
  });
  await saveSpace(admin, {
    orgId: org.id,
    name: 'Hall',
    indoor: true,
    capacitySeated: capacity,
    slotPrices: price ? { EVENING: price } : {},
  });
  await prisma.businessProfile.update({ where: { orgId: org.id }, data: { published: true } });
  return org.id;
}

beforeAll(async () => {
  admin = await makeUser('VenueSearchAdmin');
  venueOrgId = await makeVenue('BigHall', 'Lagos', 500, '9000000');
  await makeVenue('SmallRoom', 'Lagos', 40, '1000000');
});

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.availabilityBlock.deleteMany({ where: { orgId } });
    await prisma.venueSpace.deleteMany({ where: { profile: { orgId } } });
    await prisma.businessProfile.deleteMany({ where: { orgId } });
    await prisma.membership.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('searchVenues', () => {
  it('filters by capacity, price and date/slot blocks', async () => {
    const big = await searchVenues(admin, { guests: 200 });
    expect(big.hits.map((hit) => hit.orgId)).toContain(venueOrgId);
    expect(big.hits.every((hit) => hit.spaces.length > 0)).toBe(true);

    const cheap = await searchVenues(admin, { slot: 'EVENING', maxPriceMinor: '2000000' });
    expect(cheap.hits.map((hit) => hit.orgId)).not.toContain(venueOrgId);
    expect(cheap.hits.length).toBeGreaterThan(0);

    await blockAvailability(admin, { orgId: venueOrgId, date: '2027-10-01' });
    const free = await searchVenues(admin, { date: '2027-10-01', slot: 'EVENING' });
    expect(free.hits.map((hit) => hit.orgId)).not.toContain(venueOrgId);
    const other = await searchVenues(admin, { date: '2027-10-02', slot: 'EVENING' });
    expect(other.hits.map((hit) => hit.orgId)).toContain(venueOrgId);
  });
});
