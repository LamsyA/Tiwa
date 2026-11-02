import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { ConflictError, LimitReachedError, ValidationError } from '../shared/errors.js';
import { buildQuoteBrief, requestQuotes } from './requests.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeVendorOrg(name: string, categories: string[]): Promise<string> {
  const org = await prisma.organization.create({
    data: {
      kind: 'VENDOR',
      name,
      slug: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      countryCode: 'NG',
    },
  });
  orgs.push(org.id);
  await prisma.businessProfile.create({
    data: { orgId: org.id, categories, city: 'Lagos', currency: 'NGN', published: true },
  });
  return org.id;
}

let host: UserActor;
let eventId = '';
let vendorIds: string[] = [];

beforeAll(async () => {
  host = await makeUser('QuoteHost');
  const event = await prisma.event.create({
    data: {
      slug: `quote-ev-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Ada 40th',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      expectedGuests: 150,
      createdById: host.userId,
    },
  });
  events.push(event.id);
  eventId = event.id;
  await prisma.eventParticipant.create({
    data: { eventId, userId: host.userId, role: 'HOST', permissions: { preset: 'host' } },
  });
  vendorIds = [];
  for (let i = 0; i < 6; i += 1) {
    vendorIds.push(await makeVendorOrg(`cater-${i}`, ['catering']));
  }
});

afterAll(async () => {
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  for (const id of orgs) {
    await prisma.businessProfile.deleteMany({ where: { orgId: id } });
    await prisma.membership.deleteMany({ where: { orgId: id } });
    await prisma.auditLog.deleteMany({ where: { targetId: id } });
    await prisma.organization.delete({ where: { id } });
  }
  await prisma.auditLog.deleteMany({ where: { data: { path: ['eventId'], equals: eventId } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('requestQuotes', () => {
  it('creates requests with a prefilled brief and no contact details', async () => {
    const result = await requestQuotes(host, {
      eventId,
      category: 'catering',
      vendorOrgIds: vendorIds.slice(0, 2),
      notes: 'Need jollof',
    });
    expect(result.requests).toHaveLength(2);
    expect(result.brief.eventName).toBe('Ada 40th');
    const row = await prisma.quoteRequest.findFirstOrThrow({ where: { id: result.requests[0]!.id } });
    const brief = row.brief as Record<string, unknown>;
    expect(brief.eventName).toBe('Ada 40th');
    expect(brief.notes).toBe('Need jollof');
    expect(JSON.stringify(brief)).not.toMatch(/@|\+234/);
  });

  it('rejects unknown categories, duplicates and unpublished vendors', async () => {
    await expect(
      requestQuotes(host, { eventId, category: 'nope', vendorOrgIds: [vendorIds[0]!] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [vendorIds[2]!, vendorIds[2]!] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('enforces the 5-vendors-per-category limit (UF-14-3)', async () => {
    await requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: vendorIds.slice(2, 5) });
    await expect(
      requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [vendorIds[5]!] }),
    ).rejects.toBeInstanceOf(LimitReachedError);
  });

  it('rejects asking the same vendor twice', async () => {
    await expect(
      requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [vendorIds[0]!] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('lets a vendor with no categories yet be asked for any service; others must match', async () => {
    const open = await makeVendorOrg('fresh-vendor', []);
    const result = await requestQuotes(host, { eventId, category: 'cake', vendorOrgIds: [open] });
    expect(result.requests).toHaveLength(1);
    await expect(
      requestQuotes(host, { eventId, category: 'cake', vendorOrgIds: [vendorIds[0]!] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('buildQuoteBrief carries date, venue and headcount', async () => {
    const brief = await buildQuoteBrief(eventId);
    expect(brief.currency).toBe('NGN');
    expect(brief.expectedGuests).toBe(150);
    expect(brief.timezone).toBe('Africa/Lagos');
  });
});
