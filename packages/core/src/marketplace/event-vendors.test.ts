import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { getEventVendorCategories } from './event-vendors.js';
import { toggleShortlist } from './shortlist.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
const orgIds: string[] = [];
const RUN = String(Date.now()).slice(-6);
let eventId = '';
let member: UserActor;

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

beforeAll(async () => {
  member = await makeUser('VendorsMember');
  const event = await prisma.event.create({
    data: {
      slug: `vendors-${RUN}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Vendors Event',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      status: 'ACTIVE',
      createdById: member.userId,
    },
  });
  eventId = event.id;
  await prisma.eventParticipant.create({
    data: { eventId, userId: member.userId, role: 'HOST', permissions: {} },
  });
  const vendor = await prisma.organization.create({
    data: { kind: 'VENDOR', name: `Vendors Vendor ${RUN}`, slug: `vendors-vendor-${RUN}`, countryCode: 'NG' },
  });
  orgIds.push(vendor.id);
  await prisma.businessProfile.create({
    data: { orgId: vendor.id, categories: ['cake'], city: 'Lagos', currency: 'NGN' },
  });
  await toggleShortlist(member, { eventId, orgId: vendor.id });
});

afterAll(async () => {
  await prisma.shortlist.deleteMany({ where: { eventId } });
  await prisma.businessProfile.deleteMany({ where: { orgId: { in: orgIds } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
  for (const orgId of orgIds) {
    await prisma.organization.delete({ where: { id: orgId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('getEventVendorCategories', () => {
  it('lists template categories with shortlist counts; outsiders get nothing', async () => {
    const rows = await getEventVendorCategories(member, { eventId });
    expect(rows.length).toBeGreaterThan(0);
    const cake = rows.find((row) => row.category === 'cake');
    expect(cake).toMatchObject({ label: 'Cake and desserts', shortlisted: 1 });
    const stranger = await makeUser('VendorsStranger');
    await expect(getEventVendorCategories(stranger, { eventId })).rejects.toThrow();
  });
});
