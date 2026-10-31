import { prisma } from '@tiwa/db';
import { FakeStorage } from '@tiwa/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { ConflictError, ValidationError } from '../shared/errors.js';
import { savePackage } from './packages.js';
import { publishProfile, upsertBusinessProfile } from './profile.js';
import { startVerificationUpload, submitVerification } from './verification.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
let orgId = '';
let admin: UserActor;
let outsider: UserActor;
const RUN = String(Date.now()).slice(-6);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

const profileInput = (org: string) => ({
  orgId: org,
  categories: ['photography'],
  city: 'Ikeja',
  serviceAreaKm: 50,
  currency: 'NGN',
  allowGuestEnquiries: true,
});

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'Publish Org', slug: `publish-org-${RUN}`, countryCode: 'NG' },
  });
  orgId = org.id;
  admin = await makeUser('PubAdmin');
  outsider = await makeUser('PubOut');
  await prisma.membership.create({ data: { orgId, userId: admin.userId, role: 'ADMIN' } });
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

describe('publishProfile', () => {
  it('refuses until profile + 6 photos + 1 package are complete, then publishes and unpublishes', async () => {
    await expect(publishProfile(admin, { orgId, published: true })).rejects.toBeInstanceOf(ConflictError);
    await upsertBusinessProfile(admin, profileInput(orgId));
    await expect(publishProfile(admin, { orgId, published: true })).rejects.toBeInstanceOf(ConflictError);
    await prisma.portfolioItem.createMany({
      data: Array.from({ length: 6 }, (_, index) => ({ orgId, kind: 'PHOTO' as const, key: `p${index}` })),
    });
    await expect(publishProfile(admin, { orgId, published: true })).rejects.toBeInstanceOf(ConflictError);
    await savePackage(admin, { orgId, name: 'Shoot', currency: 'NGN', includes: [], addOns: [], active: true });
    const published = await publishProfile(admin, { orgId, published: true });
    expect(published.published).toBe(true);
    const unpublished = await publishProfile(admin, { orgId, published: false });
    expect(unpublished.published).toBe(false);
    await expect(publishProfile(outsider, { orgId, published: true })).rejects.toThrow();
  });
});

describe('verification', () => {
  it('uploads documents and submits once; a second pending submission conflicts', async () => {
    const storage = new FakeStorage();
    const first = await startVerificationUpload(storage, admin, {
      orgId,
      docType: 'cac',
      mime: 'application/pdf',
      sizeBytes: 5,
    });
    await storage.put(`business/${orgId}/verification/${first.uploadId}`, PDF, 'application/pdf');
    const second = await startVerificationUpload(storage, admin, {
      orgId,
      docType: 'id',
      mime: 'application/pdf',
      sizeBytes: 5,
    });
    await storage.put(`business/${orgId}/verification/${second.uploadId}`, PDF, 'application/pdf');
    const submitted = await submitVerification(storage, admin, {
      orgId,
      documents: [
        { type: 'cac', storageKey: first.storageKey },
        { type: 'id', storageKey: second.storageKey },
      ],
    });
    expect(submitted.status).toBe('PENDING');
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.verification).toBe('PENDING');
    await expect(
      submitVerification(storage, admin, { orgId, documents: [{ type: 'cac', storageKey: first.storageKey }] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects keys from another business and missing files', async () => {
    const storage = new FakeStorage();
    // Fresh org without a pending row so validation (not the pending guard) is exercised.
    const fresh = await prisma.organization.create({
      data: { kind: 'VENDOR', name: 'Verify Org', slug: `verify-org-${RUN}`, countryCode: 'NG' },
    });
    const freshAdmin = await makeUser('VerifyAdmin');
    await prisma.membership.create({ data: { orgId: fresh.id, userId: freshAdmin.userId, role: 'ADMIN' } });
    await expect(
      submitVerification(storage, outsider, {
        orgId: fresh.id,
        documents: [{ type: 'cac', storageKey: `business/${fresh.id}/verification/x` }],
      }),
    ).rejects.toThrow();
    await expect(
      submitVerification(storage, freshAdmin, {
        orgId: fresh.id,
        documents: [{ type: 'cac', storageKey: 'business/other/verification/x' }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const upload = await startVerificationUpload(storage, freshAdmin, {
      orgId: fresh.id,
      docType: 'cac',
      mime: 'application/pdf',
      sizeBytes: 5,
    });
    // Never PUT: the file is missing.
    await expect(
      submitVerification(storage, freshAdmin, {
        orgId: fresh.id,
        documents: [{ type: 'cac', storageKey: upload.storageKey }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await prisma.businessVerification.deleteMany({ where: { orgId: fresh.id } });
    await prisma.membership.deleteMany({ where: { orgId: fresh.id } });
    await prisma.auditLog.deleteMany({ where: { targetId: fresh.id } });
    await prisma.organization.delete({ where: { id: fresh.id } });
  });
});
