import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import {
  cancelSiteVisit,
  completeSiteVisit,
  confirmSiteVisit,
  declineSiteVisit,
  listSiteVisits,
  requestSiteVisit,
} from './site-visits.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];
const visits: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

let host: UserActor;
let venue: UserActor;
let outsider: UserActor;
let eventId = '';
let orgId = '';
let spaceId = '';

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

beforeAll(async () => {
  host = await makeUser('VisitHost');
  venue = await makeUser('VisitOwner');
  outsider = await makeUser('VisitOutsider');
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: `visitbiz-${Date.now()}`, slug: `visitbiz-${Date.now()}`, countryCode: 'NG' },
  });
  orgs.push(org.id);
  orgId = org.id;
  await prisma.membership.create({ data: { orgId, userId: venue.userId, role: 'OWNER' } });
  const profile = await prisma.businessProfile.create({
    data: { orgId, categories: ['venue'], city: 'Lagos', currency: 'NGN', published: true },
  });
  const space = await prisma.venueSpace.create({ data: { profileId: profile.id, name: 'Garden', slotPrices: {} } });
  spaceId = space.id;
  const event = await prisma.event.create({
    data: {
      slug: `visit-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Visit Party',
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
});

afterAll(async () => {
  await prisma.siteVisit.deleteMany({ where: { id: { in: visits } } });
  await prisma.venueSpace.deleteMany({ where: { profile: { orgId: { in: orgs } } } });
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

describe('site visits', () => {
  it('runs request → confirm → done with the venue picking a proposed time', async () => {
    const times = [future(7), future(8)];
    const { visitId } = await requestSiteVisit(host, {
      eventId,
      vendorOrgId: orgId,
      spaceId,
      proposedTimes: times,
      notes: 'Saturday morning',
    });
    visits.push(visitId);
    await expect(confirmSiteVisit(venue, { visitId, confirmedAt: future(9) })).rejects.toThrow();
    const confirmed = await confirmSiteVisit(venue, { visitId, confirmedAt: times[0]! });
    expect(confirmed.status).toBe('CONFIRMED');
    const done = await completeSiteVisit(host, { visitId });
    expect(done.status).toBe('DONE');
  });

  it('declines and cancels; outsiders cannot request', async () => {
    const { visitId } = await requestSiteVisit(host, { eventId, vendorOrgId: orgId, proposedTimes: [future(7)] });
    visits.push(visitId);
    const declined = await declineSiteVisit(venue, { visitId });
    expect(declined.status).toBe('DECLINED');
    const { visitId: second } = await requestSiteVisit(host, { eventId, vendorOrgId: orgId, proposedTimes: [future(7)] });
    visits.push(second);
    const cancelled = await cancelSiteVisit(host, { visitId: second });
    expect(cancelled.status).toBe('CANCELLED');
    await expect(
      requestSiteVisit(outsider, { eventId, vendorOrgId: orgId, proposedTimes: [future(7)] }),
    ).rejects.toThrow();
  });

  it('lists for the host event and the venue org', async () => {
    const byEvent = await listSiteVisits(host, { eventId });
    expect(byEvent.length).toBeGreaterThanOrEqual(3);
    const byOrg = await listSiteVisits(venue, { vendorOrgId: orgId });
    expect(byOrg.length).toBeGreaterThanOrEqual(3);
    expect(byOrg[0]).toHaveProperty('event');
  });
});
