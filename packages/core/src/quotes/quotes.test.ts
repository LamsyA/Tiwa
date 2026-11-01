import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { createQuote, declineEnquiry, expireQuotes, getQuote, listEnquiries, sendQuote } from './quotes.js';
import { requestQuotes } from './requests.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];
const quoteIds: string[] = [];
const requestIds: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeVendorOrg(name: string): Promise<{ orgId: string; owner: UserActor }> {
  const owner = await makeUser(name);
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name, slug: `${name}-${Date.now()}`.toLowerCase(), countryCode: 'NG' },
  });
  orgs.push(org.id);
  await prisma.membership.create({ data: { orgId: org.id, userId: owner.userId, role: 'OWNER' } });
  await prisma.businessProfile.create({
    data: { orgId: org.id, categories: ['catering'], city: 'Lagos', currency: 'NGN', published: true },
  });
  return { orgId: org.id, owner };
}

let host: UserActor;
let vendorA: UserActor;
let vendorB: UserActor;
let orgA = '';
let orgB = '';
let eventId = '';

const schedule = [{ label: 'Deposit', percentBps: 5000, due: 'on_accept' }];
const future = new Date(Date.now() + 30 * 86_400_000).toISOString();

beforeAll(async () => {
  host = await makeUser('QuoteHost2');
  const event = await prisma.event.create({
    data: {
      slug: `quote-ev2-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Tunde 30th',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      expectedGuests: 100,
      createdById: host.userId,
    },
  });
  events.push(event.id);
  eventId = event.id;
  await prisma.eventParticipant.create({
    data: { eventId, userId: host.userId, role: 'HOST', permissions: { preset: 'host' } },
  });
  ({ orgId: orgA, owner: vendorA } = await makeVendorOrg('QuoteVendorA'));
  ({ orgId: orgB, owner: vendorB } = await makeVendorOrg('QuoteVendorB'));
  const req = await requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [orgA] });
  requestIds.push(req.requests[0]!.id);
});

afterAll(async () => {
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  for (const id of orgs) {
    await prisma.businessProfile.deleteMany({ where: { orgId: id } });
    await prisma.membership.deleteMany({ where: { orgId: id } });
    await prisma.auditLog.deleteMany({ where: { targetId: id } });
    await prisma.organization.delete({ where: { id } });
  }
  await prisma.auditLog.deleteMany({ where: { targetId: { in: [...quoteIds, ...requestIds] } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
  void quoteIds;
});

describe('vendor quoting', () => {
  it('creates a draft with server-computed totals (UF-15-1)', async () => {
    const result = await createQuote(vendorA, {
      requestId: requestIds[0],
      eventId,
      vendorOrgId: orgA,
      items: [{ name: 'Rice', qty: 100, unitMinor: '150000' }],
      taxBps: 750,
      serviceBps: 500,
      travelFeeMinor: '250000',
      cancellationTerms: '50% refund before 7 days',
      proposedSchedule: schedule,
      expiresAt: future,
    });
    quoteIds.push(result.quoteId);
    const subtotal = 100n * 150_000n;
    expect(result.totalMinor).toBe(
      (subtotal + (subtotal * 750n) / 10_000n + (subtotal * 500n) / 10_000n + 250_000n).toString(),
    );
  });

  it('sends the quote and marks the request QUOTED', async () => {
    const result = await sendQuote(vendorA, { quoteId: quoteIds[0]! });
    expect(result.status).toBe('SENT');
    const request = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: requestIds[0] as string } });
    expect(request.status).toBe('QUOTED');
  });

  it('isolates vendors: vendor B cannot read vendor A quote (UF-15-2)', async () => {
    await expect(getQuote(vendorB, { quoteId: quoteIds[0]! })).rejects.toThrow();
    const own = await getQuote(vendorA, { quoteId: quoteIds[0]! });
    expect(own.id).toBe(quoteIds[0]);
  });

  it('lists open enquiries without guest contacts', async () => {
    const req = await requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [orgB] });
    requestIds.push(req.requests[0]!.id);
    const inbox = await listEnquiries(vendorB);
    expect(inbox.some((row) => row.id === req.requests[0]!.id)).toBe(true);
    expect(JSON.stringify(inbox)).not.toMatch(/\+234|@example/);
    await declineEnquiry(vendorB, { requestId: req.requests[0]!.id });
    const declined = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: req.requests[0]!.id } });
    expect(declined.status).toBe('DECLINED_BY_VENDOR');
  });

  it('expires past-due quotes (UF-15-3 will hold at accept time)', async () => {
    const past = await prisma.quote.create({
      data: {
        eventId,
        vendorOrgId: orgA,
        items: [{ name: 'X', qty: 1, unitMinor: '100' }],
        taxBps: 0,
        serviceBps: 0,
        travelFeeMinor: 0n,
        subtotalMinor: 100n,
        totalMinor: 100n,
        currency: 'NGN',
        cancellationTerms: 'none',
        proposedSchedule: schedule,
        expiresAt: new Date(Date.now() - 1000),
        status: 'SENT',
      },
      select: { id: true },
    });
    quoteIds.push(past.id);
    const result = await expireQuotes(new Date());
    expect(result.expired).toBeGreaterThanOrEqual(1);
    await expect(sendQuote(vendorA, { quoteId: past.id })).rejects.toThrow();
    const row = await prisma.quote.findUniqueOrThrow({ where: { id: past.id } });
    expect(row.status).toBe('EXPIRED');
  });
});
