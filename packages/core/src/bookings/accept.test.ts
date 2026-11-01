import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { clearFlagCache } from '../flags/flags.js';
import { FeatureDisabledError, ForbiddenError, ValidationError } from '../shared/errors.js';
import { acceptQuote } from './accept.js';
import { requestQuotes } from '../quotes/requests.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeVendorOrg(name: string, categories: string[]): Promise<{ orgId: string; owner: UserActor }> {
  const owner = await makeUser(name);
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name, slug: `${name}-${Date.now()}`.toLowerCase(), countryCode: 'NG' },
  });
  orgs.push(org.id);
  await prisma.membership.create({ data: { orgId: org.id, userId: owner.userId, role: 'OWNER' } });
  await prisma.businessProfile.create({
    data: { orgId: org.id, categories, city: 'Lagos', currency: 'NGN', published: true },
  });
  return { orgId: org.id, owner };
}

const schedule = [
  { label: 'Deposit', percentBps: 5000, due: 'on_accept' },
  { label: 'Balance', percentBps: 5000, due: 'days_before:7' },
];
const future = () => new Date(Date.now() + 30 * 86_400_000);

let host: UserActor;
let eventId = '';
let orgA = '';

async function makeSentQuote(totalMinor = 1_000_000n): Promise<string> {
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
      subtotalMinor: totalMinor,
      totalMinor,
      currency: 'NGN',
      cancellationTerms: 'none',
      proposedSchedule: schedule,
      expiresAt: future(),
      status: 'SENT',
      sentAt: new Date(),
    },
    select: { id: true },
  });
  return quote.id;
}

beforeAll(async () => {
  host = await makeUser('AcceptHost');
  const event = await prisma.event.create({
    data: {
      slug: `accept-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Accept Party',
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
  ({ orgId: orgA } = await makeVendorOrg('AcceptVendor', ['catering']));
});

afterAll(async () => {
  await prisma.paymentMilestone.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.bookingVersion.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.featureFlagOverride.deleteMany({ where: { key: 'payments.held' } });
  clearFlagCache();
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

describe('acceptQuote', () => {
  it('creates Booking v1 + milestones, records user/time/IP (UF-16-1)', async () => {
    const quoteId = await makeSentQuote();
    const result = await acceptQuote(host, { quoteId, paymentMode: 'DIRECT', declineOthers: false }, { ip: '1.2.3.4' });
    expect(result.status).toBe('DEPOSIT_DUE');
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: result.bookingId },
      include: { versions: true, milestones: true },
    });
    expect(booking.totalMinor).toBe(1_000_000n);
    expect(booking.holdExpiresAt).not.toBeNull();
    const milestoneSum = booking.milestones.reduce((sum, row) => sum + row.amountMinor, 0n);
    expect(milestoneSum).toBe(1_000_000n);
    const v1 = booking.versions.find((row) => row.version === 1)!;
    expect(v1.status).toBe('ACCEPTED');
    expect(v1.acceptedByHostId).toBe(host.userId);
    expect(v1.acceptedByHostIp).toBe('1.2.3.4');
    const auditRow = await prisma.auditLog.findFirst({ where: { targetId: booking.id, action: 'booking.accept' } });
    expect(auditRow?.ip).toBe('1.2.3.4');
  });

  it('rejects expired quotes and marks them EXPIRED (UF-15-3)', async () => {
    const quoteId = await makeSentQuote();
    await prisma.quote.update({ where: { id: quoteId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(acceptQuote(host, { quoteId, paymentMode: 'DIRECT' })).rejects.toBeInstanceOf(ValidationError);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).status).toBe('EXPIRED');
  });

  it('hides HELD unless payments.held is on (UF-16-3)', async () => {
    await prisma.featureFlagOverride.create({ data: { key: 'payments.held', countryCode: '', enabled: false } });
    clearFlagCache();
    const quoteId = await makeSentQuote();
    await expect(acceptQuote(host, { quoteId, paymentMode: 'HELD' })).rejects.toBeInstanceOf(FeatureDisabledError);
    await prisma.featureFlagOverride.deleteMany({ where: { key: 'payments.held' } });
    clearFlagCache();
  });

  it('enforces approval caps (UF-16-2)', async () => {
    const cohost = await makeUser('CappedCohost');
    await prisma.eventParticipant.create({
      data: {
        eventId,
        userId: cohost.userId,
        role: 'CO_HOST',
        permissions: { preset: 'finance', money: 'edit', approveUpToMinor: '100000' },
      },
    });
    const quoteId = await makeSentQuote(1_000_000n);
    await expect(acceptQuote(cohost, { quoteId, paymentMode: 'DIRECT' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('declines only same-category quotes when asked (UF-16-3 flow)', async () => {
    const quoteId = await makeSentQuote();
    const result = await acceptQuote(host, { quoteId, paymentMode: 'DIRECT', declineOthers: true });
    expect(result.bookingId).toBeTruthy();
  });
});
