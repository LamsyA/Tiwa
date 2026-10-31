import { prisma } from '@tiwa/db';
import { FakeStorage } from '@tiwa/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { blockAvailability } from './availability.js';
import { upsertBusinessProfile } from './profile.js';
import {
  archiveSpace,
  completeSpacePhoto,
  listSpaces,
  removeSpacePhoto,
  saveSpace,
  startSpacePhoto,
  updateVenueSettings,
} from './spaces.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
const orgIds: string[] = [];
const RUN = String(Date.now()).slice(-6);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

let admin: UserActor;
let venueOrgId = '';
let plainOrgId = '';

async function makeOrg(kind: 'VENDOR', tag: string, categories: string[]) {
  const org = await prisma.organization.create({
    data: { kind, name: `${tag} ${RUN}`, slug: `${tag.toLowerCase()}-${RUN}`, countryCode: 'NG' },
  });
  orgIds.push(org.id);
  await prisma.membership.create({ data: { orgId: org.id, userId: admin.userId, role: 'ADMIN' } });
  await upsertBusinessProfile(admin, {
    orgId: org.id,
    categories,
    city: 'Lagos',
    serviceAreaKm: 50,
    currency: 'NGN',
    allowGuestEnquiries: true,
  });
  return org.id;
}

beforeAll(async () => {
  admin = await makeUser('SpaceAdmin');
  venueOrgId = await makeOrg('VENDOR', 'SpaceVenue', ['venue', 'catering']);
  plainOrgId = await makeOrg('VENDOR', 'SpacePlain', ['photography']);
});

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.availabilityBlock.deleteMany({ where: { orgId } });
    await prisma.venueSpace.deleteMany({ where: { profile: { orgId } } });
    await prisma.businessProfile.deleteMany({ where: { orgId } });
    await prisma.membership.deleteMany({ where: { orgId } });
    await prisma.auditLog.deleteMany({ where: { targetId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('spaces', () => {
  it('refuses non-venue orgs; venues create, update, archive and set instant-book', async () => {
    await expect(
      saveSpace(admin, { orgId: plainOrgId, name: 'Hall', indoor: true, slotPrices: {} }),
    ).rejects.toBeInstanceOf(ConflictError);
    const space = await saveSpace(admin, {
      orgId: venueOrgId,
      name: 'Grand Hall',
      indoor: true,
      capacitySeated: 300,
      amenities: ['parking', 'stage'],
      slotPrices: { EVENING: '5000000' },
      securityDepositMinor: '1000000',
    });
    expect(space.slotPrices).toEqual({ EVENING: '5000000' });
    const renamed = await saveSpace(admin, {
      orgId: venueOrgId,
      spaceId: space.id,
      name: 'Grand Hall Renamed',
      indoor: true,
      slotPrices: {},
    });
    expect(renamed.name).toBe('Grand Hall Renamed');
    const settings = await updateVenueSettings(admin, { orgId: venueOrgId, instantBook: true, holdHours: 48 });
    expect(settings).toMatchObject({ instantBook: true, holdHours: 48 });
    await expect(
      updateVenueSettings(admin, { orgId: plainOrgId, instantBook: true, holdHours: 48 }),
    ).rejects.toBeInstanceOf(ConflictError);
    const listed = await listSpaces(admin, venueOrgId);
    expect(listed.map((row) => row.id)).toContain(space.id);
    await archiveSpace(admin, { orgId: venueOrgId, spaceId: space.id });
    const archived = await prisma.venueSpace.findUniqueOrThrow({ where: { id: space.id } });
    expect(archived.active).toBe(false);
    await expect(archiveSpace(admin, { orgId: venueOrgId, spaceId: space.id })).rejects.toThrow();
  });

  it('uploads, verifies and removes space photos', async () => {
    const storage = new FakeStorage();
    const space = await saveSpace(admin, { orgId: venueOrgId, name: 'Garden', indoor: false, slotPrices: {} });
    const started = await startSpacePhoto(storage, admin, {
      orgId: venueOrgId,
      spaceId: space.id,
      mime: 'image/jpeg',
      sizeBytes: 6,
    });
    await storage.put(started.storageKey, JPEG, 'image/jpeg');
    const done = await completeSpacePhoto(storage, admin, {
      orgId: venueOrgId,
      spaceId: space.id,
      storageKey: started.storageKey,
    });
    expect(done.photoKeys).toContain(started.storageKey);
    await removeSpacePhoto(storage, admin, { orgId: venueOrgId, spaceId: space.id, storageKey: started.storageKey });
    const cleaned = await prisma.venueSpace.findUniqueOrThrow({ where: { id: space.id } });
    expect(cleaned.photoKeys).toHaveLength(0);
    await expect(
      completeSpacePhoto(storage, admin, { orgId: venueOrgId, spaceId: space.id, storageKey: 'business/x/spaces/y/z' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('blocks per-space slots; whole-business FULL_DAY still conflicts', async () => {
    const space = await saveSpace(admin, { orgId: venueOrgId, name: 'Rooftop', indoor: false, slotPrices: {} });
    await blockAvailability(admin, { orgId: venueOrgId, spaceId: space.id, date: '2027-08-01', slot: 'EVENING' });
    await expect(
      blockAvailability(admin, { orgId: venueOrgId, spaceId: space.id, date: '2027-08-01', slot: 'FULL_DAY' }),
    ).rejects.toThrow();
    await expect(
      blockAvailability(admin, { orgId: venueOrgId, date: '2027-08-01', slot: 'MORNING' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      blockAvailability(admin, {
        orgId: venueOrgId,
        spaceId: '00000000-0000-7000-8000-000000000000',
        date: '2027-08-01',
        slot: 'EVENING',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
