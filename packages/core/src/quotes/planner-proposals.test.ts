import { PLANNING_CATEGORY } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { acceptQuote } from '../bookings/accept.js';
import { loadEventAccess, permissionsFor, toStoredPermissions } from '../events/access.js';
import { ValidationError } from '../shared/errors.js';
import { getCategoryOverview } from './overview.js';
import { compareQuotes, requestQuoteChanges } from './decisions.js';
import { listSentQuotes, quoteHistory } from './history.js';
import { NotFoundError } from '../shared/errors.js';
import { createQuote, getEnquiry, listEnquiries, sendQuote, updateQuote } from './quotes.js';
import { requestQuotes } from './requests.js';

// D-X64: a host asks a planner for a proposal through the quote pipeline,
// the planner answers it, and accepting the proposal hires the planner.

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeOrg(kind: 'VENDOR' | 'PLANNER', name: string, categories: string[]) {
  const owner = await makeUser(name);
  const org = await prisma.organization.create({
    data: {
      kind,
      name,
      slug: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toLowerCase(),
      countryCode: 'NG',
    },
  });
  orgs.push(org.id);
  await prisma.membership.create({ data: { orgId: org.id, userId: owner.userId, role: 'OWNER' } });
  await prisma.businessProfile.create({
    data: { orgId: org.id, categories, city: 'Lagos', currency: 'NGN', published: true },
  });
  return { orgId: org.id, owner };
}

let host: UserActor;
let eventId = '';
let planner: { orgId: string; owner: UserActor };
let vendor: { orgId: string; owner: UserActor };

beforeAll(async () => {
  host = await makeUser('ProposalHost');
  const event = await prisma.event.create({
    data: {
      slug: `proposal-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Proposal Party',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      startsAt: new Date(Date.now() + 60 * 86_400_000),
      createdById: host.userId,
    },
  });
  events.push(event.id);
  eventId = event.id;
  await prisma.eventParticipant.create({
    data: { eventId, userId: host.userId, role: 'HOST', permissions: toStoredPermissions(permissionsFor('HOST')) },
  });
  planner = await makeOrg('PLANNER', 'ProposalPlanner', ['birthdays']);
  vendor = await makeOrg('VENDOR', 'ProposalCaterer', ['catering']);
});

afterAll(async () => {
  await prisma.message.deleteMany({ where: { thread: { eventId: { in: events } } } });
  await prisma.threadParticipant.deleteMany({ where: { thread: { eventId: { in: events } } } });
  await prisma.thread.deleteMany({ where: { eventId: { in: events } } });
  await prisma.paymentMilestone.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.bookingVersion.deleteMany({ where: { booking: { eventId: { in: events } } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.shortlist.deleteMany({ where: { eventId: { in: events } } });
  for (const id of orgs) {
    await prisma.businessProfile.deleteMany({ where: { orgId: id } });
    await prisma.membership.deleteMany({ where: { orgId: id } });
  }
  await prisma.event.updateMany({ where: { id: { in: events } }, data: { clientId: null } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('planner proposals (D-X64)', () => {
  it('refuses a planning request to a vendor and a vendor-category request to a planner', async () => {
    await expect(
      requestQuotes(host, { eventId, category: PLANNING_CATEGORY, vendorOrgIds: [vendor.orgId] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [planner.orgId] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('sends the request to the planner, who sees it in their inbox', async () => {
    await prisma.shortlist.create({ data: { eventId, orgId: planner.orgId } });
    const result = await requestQuotes(host, {
      eventId,
      category: PLANNING_CATEGORY,
      vendorOrgIds: [planner.orgId],
      notes: 'Full planning for 120 guests',
    });
    expect(result.requests).toHaveLength(1);
    // D-X69: the host lands in the planner's pipeline as an enquiry.
    const client = await prisma.client.findUniqueOrThrow({
      where: { orgId_userId: { orgId: planner.orgId, userId: host.userId } },
    });
    expect(client.stage).toBe('ENQUIRY');
    expect((await prisma.quoteRequest.findUniqueOrThrow({ where: { id: result.requests[0]!.id } })).clientId).toBe(
      client.id,
    );
    const inbox = await listEnquiries(planner.owner);
    expect(inbox.some((row) => row.category === PLANNING_CATEGORY && row.eventId === eventId)).toBe(true);
    const overview = await getCategoryOverview(host, { eventId, category: PLANNING_CATEGORY });
    expect(overview.requests.map((row) => row.vendorOrgId)).toContain(planner.orgId);
  });

  it('lets a planner answer only a planning request', async () => {
    const base = {
      eventId,
      vendorOrgId: planner.orgId,
      items: [{ name: 'Full planning', qty: 1, unitMinor: '150000000' }],
      taxBps: 0,
      serviceBps: 0,
      travelFeeMinor: '0',
      cancellationTerms: '50% refundable up to 30 days before',
      proposedSchedule: [{ label: 'Retainer', percentBps: 10000, due: 'on_accept' }],
      expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    };
    await expect(createQuote(planner.owner, base)).rejects.toBeInstanceOf(ValidationError);
  });

  it('runs the change-request loop: message kept, inbox resurfaces it, revision re-sent (D-X66)', async () => {
    const request = await prisma.quoteRequest.findFirstOrThrow({
      where: { eventId, category: PLANNING_CATEGORY, vendorOrgId: planner.orgId },
    });
    const draft = await createQuote(planner.owner, {
      requestId: request.id,
      eventId,
      vendorOrgId: planner.orgId,
      items: [{ name: 'Full planning', qty: 1, unitMinor: '150000000' }],
      taxBps: 0,
      serviceBps: 0,
      travelFeeMinor: '0',
      cancellationTerms: 'Retainer non-refundable',
      proposedSchedule: [{ label: 'Retainer', percentBps: 10000, due: 'on_accept' }],
      expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    });
    await sendQuote(planner.owner, { quoteId: draft.quoteId });
    const stage = async () =>
      (
        await prisma.client.findUniqueOrThrow({
          where: { orgId_userId: { orgId: planner.orgId, userId: host.userId } },
        })
      ).stage;
    expect(await stage()).toBe('PROPOSAL_SENT');
    // Once answered, the request leaves the inbox…
    expect((await listEnquiries(planner.owner)).some((row) => row.id === request.id)).toBe(false);

    await requestQuoteChanges(host, { quoteId: draft.quoteId, message: 'Please include the Friday engagement' });
    const stored = await prisma.quote.findUniqueOrThrow({ where: { id: draft.quoteId } });
    expect(stored.status).toBe('CHANGES_REQUESTED');
    expect(stored.changeRequest).toBe('Please include the Friday engagement');
    // …and comes back, first, with the client's message.
    const inbox = await listEnquiries(planner.owner);
    expect(inbox[0]?.id).toBe(request.id);
    expect(inbox[0]?.changeRequest?.message).toBe('Please include the Friday engagement');
    const enquiry = await getEnquiry(planner.owner, { requestId: request.id });
    expect(enquiry.quotes.find((row) => row.id === draft.quoteId)?.changeRequest).toBe(
      'Please include the Friday engagement',
    );

    await updateQuote(planner.owner, {
      quoteId: draft.quoteId,
      items: [
        { name: 'Full planning', qty: 1, unitMinor: '150000000' },
        { name: 'Friday engagement', qty: 1, unitMinor: '30000000' },
      ],
    });
    await sendQuote(planner.owner, { quoteId: draft.quoteId });
    const revised = await prisma.quote.findUniqueOrThrow({ where: { id: draft.quoteId } });
    expect(revised.status).toBe('SENT');
    expect(revised.revision).toBe(2);
    expect(revised.totalMinor).toBe(180_000_000n);

    // D-X67: both sides read the same history; outsiders can't.
    for (const reader of [planner.owner, host]) {
      const history = await quoteHistory(reader, { quoteId: draft.quoteId });
      expect(history.versions.map((row) => row.revision)).toEqual([1, 2]);
      expect(history.versions[0]?.totalMinor).toBe('150000000');
      expect(history.versions[0]?.changeRequest).toBe('Please include the Friday engagement');
      expect(history.versions[1]?.totalMinor).toBe('180000000');
      expect(history.versions[1]?.changeRequest).toBeNull();
    }
    await expect(quoteHistory(vendor.owner, { quoteId: draft.quoteId })).rejects.toBeInstanceOf(NotFoundError);
    const sent = await listSentQuotes(planner.owner);
    expect(sent.find((row) => row.id === draft.quoteId)?.revision).toBe(2);
    expect((await listEnquiries(planner.owner)).some((row) => row.id === request.id)).toBe(false);
  });

  it('hires the planner onto the event when the host accepts the proposal', async () => {
    const request = await prisma.quoteRequest.findFirstOrThrow({
      where: { eventId, category: PLANNING_CATEGORY, vendorOrgId: planner.orgId },
    });
    const quote = await prisma.quote.create({
      data: {
        requestId: request.id,
        eventId,
        vendorOrgId: planner.orgId,
        items: [{ name: 'Full planning', qty: 1, unitMinor: '150000000' }],
        subtotalMinor: 150_000_000n,
        totalMinor: 150_000_000n,
        currency: 'NGN',
        cancellationTerms: '50% refundable up to 30 days before',
        proposedSchedule: [
          { label: 'Retainer', percentBps: 5000, due: 'on_accept' },
          { label: 'Balance', percentBps: 5000, due: 'days_before:14' },
        ],
        expiresAt: new Date(Date.now() + 14 * 86_400_000),
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    expect(await loadEventAccess(planner.owner.userId, eventId)).toBeNull();
    const result = await acceptQuote(host, { quoteId: quote.id, paymentMode: 'DIRECT', declineOthers: false });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: result.bookingId },
      include: { milestones: true },
    });
    expect(booking.milestones.reduce((sum, row) => sum + row.amountMinor, 0n)).toBe(150_000_000n);
    const access = await loadEventAccess(planner.owner.userId, eventId);
    expect(access?.role).toBe('PLANNER');
    const row = await prisma.eventParticipant.findFirstOrThrow({
      where: { eventId, userId: planner.owner.userId, removedAt: null },
    });
    expect(row.orgId).toBe(planner.orgId);
    expect(
      (
        await prisma.client.findUniqueOrThrow({
          where: { orgId_userId: { orgId: planner.orgId, userId: host.userId } },
        })
      ).stage,
    ).toBe('WON');
    // D-X71: the host's own event is linked to the planner's client, so it is continued, not duplicated.
    const wonClient = await prisma.client.findUniqueOrThrow({
      where: { orgId_userId: { orgId: planner.orgId, userId: host.userId } },
    });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).clientId).toBe(wonClient.id);

    // D-X68: the hired planner hides vendor prices — but never their own fee from the host.
    await prisma.event.update({ where: { id: eventId }, data: { hostCanSeeVendorPrices: false } });
    const seen = await compareQuotes(host, { eventId, category: PLANNING_CATEGORY });
    expect(seen.find((q) => q.id === quote.id)?.totalMinor).toBe('150000000');
    const history = await quoteHistory(host, { quoteId: quote.id });
    expect(history.versions.every((v) => v.totalMinor !== null)).toBe(true);
  });
});
