// D-X47: business logo upload — managers only, image bytes checked.
import { prisma } from '@tiwa/db';
import { FakeStorage } from '@tiwa/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { completeLogoUpload, orgLogoKey, startLogoUpload } from './logo.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
let orgId = '';
let admin: UserActor;
let staff: UserActor;
const RUN = String(Date.now()).slice(-6);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { kind: 'PLANNER', name: 'Logo Co', slug: `logo-${RUN}`, countryCode: 'NG' },
  });
  orgId = org.id;
  admin = await makeUser('Logo Admin');
  staff = await makeUser('Logo Staff');
  await prisma.membership.create({ data: { orgId, userId: admin.userId, role: 'ADMIN' } });
  await prisma.membership.create({ data: { orgId, userId: staff.userId, role: 'STAFF' } });
});

afterAll(async () => {
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { targetId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe('business logo (D-X47)', () => {
  it('stores a checked image and refuses staff and non-images', async () => {
    const storage = new FakeStorage();
    const started = await startLogoUpload(storage, admin, { orgId, mime: 'image/png', sizeBytes: PNG.length });
    await storage.put(started.key, PNG, 'image/png');
    await completeLogoUpload(storage, admin, { orgId, key: started.key });
    expect(await orgLogoKey(orgId)).toBe(started.key);

    const bad = await startLogoUpload(storage, admin, { orgId, mime: 'image/png', sizeBytes: 4 });
    await storage.put(bad.key, new Uint8Array([1, 2, 3, 4]), 'image/png');
    await expect(completeLogoUpload(storage, admin, { orgId, key: bad.key })).rejects.toThrow('not an image');
    await expect(startLogoUpload(storage, staff, { orgId, mime: 'image/png', sizeBytes: 10 })).rejects.toThrow();
    await expect(completeLogoUpload(storage, admin, { orgId, key: 'business/other/logo/x' })).rejects.toThrow();
  });
});
