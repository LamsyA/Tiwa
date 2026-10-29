import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../shared/errors.js';
import {
  businessSchema,
  completeBusinessOnboarding,
  completeHostProfile,
  hostProfileSchema,
  safeNextPath,
  triageOnboarding,
} from './onboarding.js';

const created: string[] = [];

async function makeUser(data: { name: string; phone?: string }) {
  const user = await prisma.user.create({ data: { ...data, countryCode: 'NG' } });
  created.push(user.id);
  return user;
}

afterAll(async () => {
  const orgs = await prisma.organization.findMany({ where: { members: { some: { userId: { in: created } } } } });
  await prisma.membership.deleteMany({ where: { userId: { in: created } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs.map((org) => org.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('safeNextPath', () => {
  it('keeps same-origin paths and rejects everything else', () => {
    expect(safeNextPath('/events/x?tab=1', '/home')).toBe('/events/x?tab=1');
    expect(safeNextPath('https://evil.test', '/home')).toBe('/home');
    expect(safeNextPath('//evil.test', '/home')).toBe('/home');
    expect(safeNextPath('/\\evil.test', '/home')).toBe('/home');
    expect(safeNextPath(null, '/home')).toBe('/home');
  });
});

describe('triageOnboarding', () => {
  it('sends members of an organisation to next or /home (invited members skip the role step)', () => {
    expect(triageOnboarding({ name: '+2341', phone: '+2341', membershipCount: 1 })).toEqual({
      done: true,
      to: '/home',
    });
    expect(triageOnboarding({ name: 'Ada', phone: null, membershipCount: 2 }, '/events/x')).toEqual({
      done: true,
      to: '/events/x',
    });
  });

  it('sends named users to next or /home', () => {
    expect(triageOnboarding({ name: 'Ada', phone: null, membershipCount: 0 })).toEqual({ done: true, to: '/home' });
    expect(triageOnboarding({ name: 'Ada', phone: null, membershipCount: 0 }, 'https://evil.test')).toEqual({
      done: true,
      to: '/home',
    });
  });

  it('asks unfinished profiles to pick a role', () => {
    expect(triageOnboarding({ name: null, phone: null, membershipCount: 0 })).toEqual({ done: false, step: 'role' });
    expect(triageOnboarding({ name: '+2348012345678', phone: '+2348012345678', membershipCount: 0 })).toEqual({
      done: false,
      step: 'role',
    });
    expect(triageOnboarding({ name: '  ', phone: null, membershipCount: 0 })).toEqual({ done: false, step: 'role' });
  });
});

describe('schemas', () => {
  it('return message keys, not English', () => {
    const host = hostProfileSchema.safeParse({ name: ' ' });
    expect(host.success).toBe(false);
    expect(host.error?.flatten().fieldErrors.name).toEqual(['nameTooShort']);
    const business = businessSchema.safeParse({ kind: 'VENDOR', name: '', city: '' });
    expect(business.error?.flatten().fieldErrors).toMatchObject({
      name: ['businessNameTooShort'],
      city: ['cityTooShort'],
    });
    expect(businessSchema.safeParse({ kind: 'NOPE', name: 'Xy', city: 'Lagos' }).success).toBe(false);
  });
});

describe('completeHostProfile', () => {
  it('sets a real name', async () => {
    const user = await makeUser({ name: 'temp' });
    expect(await completeHostProfile(user.id, { name: 'Adaeze' })).toEqual({ name: 'Adaeze' });
  });
});

describe('completeBusinessOnboarding', () => {
  it('creates an org with the caller as OWNER (UF-01-3)', async () => {
    const user = await makeUser({ name: 'Planner Pam' });
    const { orgId } = await completeBusinessOnboarding(user.id, { kind: 'PLANNER', name: 'Pam Events', city: 'Lagos' });
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org).toMatchObject({ kind: 'PLANNER', countryCode: 'NG', city: 'Lagos' });
    expect(org.slug.startsWith('pam-events-')).toBe(true);
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { orgId_userId: { orgId, userId: user.id } },
    });
    expect(membership.role).toBe('OWNER');
  });

  it('sets the owner name when given (phone users)', async () => {
    const user = await makeUser({ name: '+2348000000001', phone: '+2348000000001' });
    await completeBusinessOnboarding(user.id, { kind: 'VENDOR', name: 'Bisi Foods', city: 'Lagos', ownerName: 'Bisi' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe('Bisi');
  });

  it('refuses a second business of the same kind (double submit)', async () => {
    const user = await makeUser({ name: 'Vee' });
    await completeBusinessOnboarding(user.id, { kind: 'VENDOR', name: 'Vee DJ', city: 'Lagos' });
    await expect(
      completeBusinessOnboarding(user.id, { kind: 'VENDOR', name: 'Vee DJ', city: 'Lagos' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
