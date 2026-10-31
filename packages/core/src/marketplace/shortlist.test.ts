import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { NotFoundError } from '../shared/errors.js';
import { listShortlist, toggleShortlist } from './shortlist.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
const orgIds: string[] = [];
const RUN = String(Date.now()).slice(-6);
let eventId = '';
let member: UserActor;
let outsider: UserActor;
let vendorOrgId = '';

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

beforeAll(async () => {
  member = await makeUser('ShortMember');
  outsider = await makeUser('ShortOut');
  const event = await prisma.event.create({
    data: {
      slug: `short-${RUN}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Short Event',
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
    data: { kind: 'VENDOR', name: `Short Vendor ${RUN}`, slug: `short-vendor-${RUN}`, countryCode: 'NG' },
  });
  vendorOrgId = vendor.id;
  orgIds.push(vendor.id);
});

afterAll(async () => {
  await prisma.shortlist.deleteMany({ where: { eventId } });
  await prisma.eventParticipant.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
  for (const orgId of orgIds) {
    await prisma.membership.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('shortlist', () => {
  it('toggles a pick; members read the list, outsiders cannot', async () => {
    expect(await toggleShortlist(member, { eventId, orgId: vendorOrgId })).toEqual({ shortlisted: true });
    const listed = await listShortlist(member, { eventId });
    expect(listed.map((row) => row.orgId)).toContain(vendorOrgId);
    expect(await toggleShortlist(member, { eventId, orgId: vendorOrgId })).toEqual({ shortlisted: false });
    expect(await listShortlist(member, { eventId })).toHaveLength(0);
    await expect(toggleShortlist(outsider, { eventId, orgId: vendorOrgId })).rejects.toThrow();
    await expect(toggleShortlist(member, { eventId, orgId: member.userId })).rejects.toBeInstanceOf(NotFoundError);
  });
});
