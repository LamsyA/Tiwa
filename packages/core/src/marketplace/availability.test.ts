import { prisma } from '@tiwa/db';
import { FakeStorage } from '@tiwa/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { ForbiddenError, ValidationError } from '../shared/errors.js';
import {
  blockAvailability,
  confirmAvailability,
  listAvailability,
  unblockAvailability,
} from './availability.js';
import { completePortfolioUpload, removePortfolioItem, startPortfolioUpload } from './portfolio.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
let orgId = '';
let admin: UserActor;
let outsider: UserActor;
const RUN = String(Date.now()).slice(-6);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'Media Org', slug: `media-org-${RUN}`, countryCode: 'NG' },
  });
  orgId = org.id;
  admin = await makeUser('MediaAdmin');
  outsider = await makeUser('MediaOut');
  await prisma.membership.create({ data: { orgId, userId: admin.userId, role: 'ADMIN' } });
});

afterAll(async () => {
  await prisma.portfolioItem.deleteMany({ where: { orgId } });
  await prisma.availabilityBlock.deleteMany({ where: { orgId } });
  await prisma.businessProfile.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { targetId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('portfolio uploads', () => {
  it('start → PUT → complete verifies magic bytes; junk is deleted', async () => {
    const storage = new FakeStorage();
    const { itemId } = await startPortfolioUpload(storage, admin, { orgId, mime: 'image/jpeg', sizeBytes: 6 });
    await storage.put(`business/${orgId}/portfolio/${itemId}`, JPEG, 'image/jpeg');
    const done = await completePortfolioUpload(storage, admin, { orgId, itemId });
    expect(done.itemId).toBe(itemId);

    const bad = await startPortfolioUpload(storage, admin, { orgId, mime: 'image/png', sizeBytes: 4 });
    await storage.put(`business/${orgId}/portfolio/${bad.itemId}`, new Uint8Array([1, 2, 3, 4]), 'image/png');
    await expect(completePortfolioUpload(storage, admin, { orgId, itemId: bad.itemId })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(prisma.portfolioItem.findUnique({ where: { id: bad.itemId } })).resolves.toBeNull();

    await removePortfolioItem(storage, admin, { orgId, itemId });
    await expect(prisma.portfolioItem.findUnique({ where: { id: itemId } })).resolves.toBeNull();
    await expect(removePortfolioItem(storage, admin, { orgId, itemId })).rejects.toThrow();
  });

  it('outsiders cannot upload', async () => {
    const storage = new FakeStorage();
    await expect(
      startPortfolioUpload(storage, outsider, { orgId, mime: 'image/jpeg', sizeBytes: 6 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('availability', () => {
  it('blocks, lists and unblocks dates; confirm sets the heartbeat', async () => {
    await blockAvailability(admin, { orgId, date: '2027-05-01', reason: 'Booked outside Tiwa' });
    // Idempotent re-block updates the reason instead of doubling.
    await blockAvailability(admin, { orgId, date: '2027-05-01' });
    const rows = await listAvailability(admin, orgId, '2027-01-01', '2027-12-31');
    expect(rows).toHaveLength(1);
    await expect(blockAvailability(outsider, { orgId, date: '2027-05-02' })).rejects.toBeInstanceOf(ForbiddenError);
    await unblockAvailability(admin, { orgId, blockId: rows[0]!.id });
    await expect(listAvailability(admin, orgId, '2027-01-01', '2027-12-31')).resolves.toHaveLength(0);

    const profile = await confirmAvailability(admin, { orgId });
    expect(profile.availabilityConfirmedAt).toBeInstanceOf(Date);
  });
});
