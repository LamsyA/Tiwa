import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { compareQuotes, declineQuote, requestQuoteChanges } from './decisions.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { sendQuote } from './quotes.js';
import { requestQuotes } from './requests.js';

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
  const owner = await makeUser(name);
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name, slug: `${name}-${Date.now()}`.toLowerCase(), countryCode: 'NG' },
  });
  orgs.push(org.id);
  await prisma.membership.create({ data: { orgId: org.id, userId: owner.userId, role: 'OWNER' } });
  await prisma.businessProfile.create({
    data: { orgId: org.id, categories, city: 'Lagos', currency: 'NGN', published: true },
  });
  return org.id;
}

const schedule = [
  { label: 'Deposit', percentBps: 5000, due: 'on_accept' },
  { label: 'Balance', percentBps: 5000, due: 'days_before:7' },
];
const future = new Date(Date.now() + 30 * 86_400_000).toISOString();

let host: UserActor;
let eventId = '';
let orgA = '';

async function makeSentQuote(): Promise<string> {
  let request: { id: string } | null = await prisma.quoteRequest.findFirst({
    where: { eventId, category: 'catering', vendorOrgId: orgA },
    select: { id: true },
  });
  if (!request) {
    const req = await requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [orgA] });
    request = { id: req.requests[0]!.id as string };
  }
  const quote = await prisma.quote.create({
    data: {
      requestId: request!.id as string,
      eventId,
      vendorOrgId: orgA,
      items: [{ name: 'Rice', qty: 10, unitMinor: '100000' }],
      subtotalMinor: 1_000_000n,
      totalMinor: 1_000_000n,
      currency: 'NGN',
      cancellationTerms: 'none',
      proposedSchedule: schedule,
      expiresAt: new Date(future),
      status: 'SENT',
      sentAt: new Date(),
    },
    select: { id: true },
  });
  return quote.id;
}

beforeAll(async () => {
  host = await makeUser('DecideHost');
  const event = await prisma.event.create({
    data: {
      slug: `decide-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Decide Party',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      createdById: host.userId,
    },
  });
  events.push(event.id);
  eventId = event.id;
  await prisma.eventParticipant.create({
    data: { eventId, userId: host.userId, role: 'HOST', permissions: toStoredPermissions(permissionsFor('HOST')) },
  });
  orgA = await makeVendorOrg('DecideVendor', ['catering']);
});

afterAll(async () => {
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  for (const id of orgs) {
    await prisma.businessProfile.deleteMany({ where: { orgId: id } });
    await prisma.membership.deleteMany({ where: { orgId: id } });
    await prisma.organization.delete({ where: { id } });
  }
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('host quote decisions', () => {
  it('compares sent quotes cheapest first with vendor names', async () => {
    await makeSentQuote();
    const rows = await compareQuotes(host, { eventId, category: 'catering' });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.vendor?.name).toBeTruthy();
    const totals = rows.map((row) => BigInt(row.totalMinor));
    expect([...totals].sort((a, b) => (a < b ? -1 : 1))).toEqual(totals);
  });

  it('requests changes and the vendor can resend', async () => {
    const quoteId = await makeSentQuote();
    // Vendor owner resends after a change request: need vendor actor.
    const membership = await prisma.membership.findFirstOrThrow({ where: { orgId: orgA } });
    const vendor = { kind: 'user', userId: membership.userId, isAdmin: false } as UserActor;
    const changed = await requestQuoteChanges(host, { quoteId, message: 'Add drinks' });
    expect(changed.status).toBe('CHANGES_REQUESTED');
    const resent = await sendQuote(vendor, { quoteId });
    expect(resent.status).toBe('SENT');
  });

  it('declines a sent quote', async () => {
    const quoteId = await makeSentQuote();
    const declined = await declineQuote(host, { quoteId });
    expect(declined.status).toBe('DECLINED');
  });
});
