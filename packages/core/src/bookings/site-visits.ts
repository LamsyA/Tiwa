import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize } from '../auth/authorize.js';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { loadEventAccess, requireEventAccess } from '../events/access.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';
import { mirrorToEventTeam } from '../chat/cards.js';

// Site visits (QTE-08, P7-T11): the host team proposes up to 3 times to tour
// a venue; the venue confirms one, declines, or either side completes or
// cancels. Venue-only: the org must be a venue business.

type UserActor = Extract<Actor, { kind: 'user' }>;

async function requireVenue(vendorOrgId: string, spaceId: string | null) {
  const org = await prisma.organization.findUnique({
    where: { id: vendorOrgId },
    select: { kind: true, profile: { select: { categories: true } } },
  });
  if (!org || org.kind !== 'VENDOR' || !org.profile?.categories.includes('venue')) {
    throw new ValidationError('Site visits are for venue businesses', { key: 'notVenue' });
  }
  if (spaceId) {
    const space = await prisma.venueSpace.findFirst({
      where: { id: spaceId, profile: { orgId: vendorOrgId }, active: true },
      select: { id: true },
    });
    if (!space) throw new NotFoundError('Space not found');
  }
}

function vendorAccess(actor: UserActor, vendorOrgId: string) {
  return prisma.membership
    .findFirst({ where: { userId: actor.userId, orgId: vendorOrgId }, select: { role: true } })
    .then((membership) => {
      if (!membership) throw new ForbiddenError('Only the venue team decides site visits');
      authorizeOrg(actor, 'org.manage', vendorOrgId, { orgId: vendorOrgId, role: membership.role });
    });
}

export const requestSiteVisitSchema = z.object({
  eventId: z.string().uuid(),
  vendorOrgId: z.string().uuid(),
  spaceId: z.string().uuid().optional(),
  proposedTimes: z.array(z.string().datetime({ offset: true })).min(1, 'timesRequired').max(3, 'tooManyTimes'),
  notes: z.string().trim().max(2000, 'notesTooLong').optional(),
});

export async function requestSiteVisit(actor: UserActor, raw: z.infer<typeof requestSiteVisitSchema>) {
  const input = requestSiteVisitSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.edit');
  await requireVenue(input.vendorOrgId, input.spaceId ?? null);
  const times = input.proposedTimes.map((time) => new Date(time));
  if (times.some((time) => Number.isNaN(time.getTime()) || time <= new Date())) {
    throw new ValidationError('Proposed times must be in the future', { key: 'timesPast' });
  }
  const visit = await prisma.siteVisit.create({
    data: {
      eventId: input.eventId,
      vendorOrgId: input.vendorOrgId,
      spaceId: input.spaceId ?? null,
      requestedById: actor.userId,
      proposedTimes: times,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });
  await audit(prisma, {
    actor,
    action: 'siteVisit.request',
    targetType: 'SiteVisit',
    targetId: visit.id,
    data: { eventId: input.eventId, vendorOrgId: input.vendorOrgId },
  });
  await enqueue(prisma, 'site_visit.requested', {
    visitId: visit.id,
    eventId: input.eventId,
    vendorOrgId: input.vendorOrgId,
  });
  return { visitId: visit.id };
}

export const visitIdSchema = z.object({ visitId: z.string().uuid() });

async function loadVisit(visitId: string) {
  const visit = await prisma.siteVisit.findUnique({ where: { id: visitId } });
  if (!visit) throw new NotFoundError('Site visit not found');
  return visit;
}

export const confirmSiteVisitSchema = z.object({
  visitId: z.string().uuid(),
  confirmedAt: z.string().datetime({ offset: true }),
});

/** The venue locks in one of the proposed times. */
export async function confirmSiteVisit(actor: UserActor, raw: z.infer<typeof confirmSiteVisitSchema>) {
  const input = confirmSiteVisitSchema.parse(raw);
  const visit = await loadVisit(input.visitId);
  await vendorAccess(actor, visit.vendorOrgId);
  if (visit.status !== 'REQUESTED') throw new ValidationError('This visit is no longer open', { key: 'visitClosed' });
  const confirmedAt = new Date(input.confirmedAt);
  if (!visit.proposedTimes.some((time) => time.getTime() === confirmedAt.getTime())) {
    throw new ValidationError('Pick one of the proposed times', { key: 'timeNotProposed' });
  }
  await prisma.siteVisit.update({ where: { id: visit.id }, data: { status: 'CONFIRMED', confirmedAt } });
  await audit(prisma, { actor, action: 'siteVisit.confirm', targetType: 'SiteVisit', targetId: visit.id, data: {} });
  await enqueue(prisma, 'site_visit.confirmed', { visitId: visit.id, eventId: visit.eventId, vendorOrgId: visit.vendorOrgId });
  if (visit.eventId) {
    try {
      await mirrorToEventTeam(actor, visit.eventId, 'site_visit', visit.id);
    } catch {
      // Best-effort mirror; the confirmation already succeeded.
    }
  }
  return { status: 'CONFIRMED' as const };
}

export async function declineSiteVisit(actor: UserActor, raw: z.infer<typeof visitIdSchema>) {
  const { visitId } = visitIdSchema.parse(raw);
  const visit = await loadVisit(visitId);
  await vendorAccess(actor, visit.vendorOrgId);
  if (visit.status !== 'REQUESTED') throw new ValidationError('This visit is no longer open', { key: 'visitClosed' });
  await prisma.siteVisit.update({ where: { id: visit.id }, data: { status: 'DECLINED' } });
  await audit(prisma, { actor, action: 'siteVisit.decline', targetType: 'SiteVisit', targetId: visit.id, data: {} });
  return { status: 'DECLINED' as const };
}

/** Either side marks a confirmed visit done, or cancels an open one. */
export async function completeSiteVisit(actor: UserActor, raw: z.infer<typeof visitIdSchema>) {
  const { visitId } = visitIdSchema.parse(raw);
  const visit = await loadVisit(visitId);
  await visitAccess(actor, visit);
  if (visit.status !== 'CONFIRMED') throw new ValidationError('Only a confirmed visit can complete', { key: 'visitNotConfirmed' });
  await prisma.siteVisit.update({ where: { id: visit.id }, data: { status: 'DONE' } });
  await audit(prisma, { actor, action: 'siteVisit.complete', targetType: 'SiteVisit', targetId: visit.id, data: {} });
  return { status: 'DONE' as const };
}

export async function cancelSiteVisit(actor: UserActor, raw: z.infer<typeof visitIdSchema>) {
  const { visitId } = visitIdSchema.parse(raw);
  const visit = await loadVisit(visitId);
  await visitAccess(actor, visit);
  if (visit.status !== 'REQUESTED' && visit.status !== 'CONFIRMED') {
    throw new ValidationError('This visit can no longer change', { key: 'visitClosed' });
  }
  await prisma.siteVisit.update({ where: { id: visit.id }, data: { status: 'CANCELLED' } });
  await audit(prisma, { actor, action: 'siteVisit.cancel', targetType: 'SiteVisit', targetId: visit.id, data: {} });
  return { status: 'CANCELLED' as const };
}

async function visitAccess(
  actor: UserActor,
  visit: { eventId: string | null; vendorOrgId: string },
): Promise<'host' | 'vendor'> {
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: visit.vendorOrgId },
    select: { role: true },
  });
  if (membership) return 'vendor';
  if (!visit.eventId) throw new ForbiddenError('Only the event team or the venue decides site visits');
  const access = await loadEventAccess(actor.userId, visit.eventId);
  if (!access) throw new NotFoundError('Site visit not found');
  authorize(actor, 'event.edit', { eventId: visit.eventId, access });
  return 'host';
}

export const listSiteVisitsSchema = z.object({
  eventId: z.string().uuid().optional(),
  vendorOrgId: z.string().uuid().optional(),
});

/** Host sees their event's visits; a vendor sees their org's. */
export async function listSiteVisits(actor: UserActor, raw: z.infer<typeof listSiteVisitsSchema>) {
  const input = listSiteVisitsSchema.parse(raw);
  if (input.eventId) {
    await requireEventAccess(actor, input.eventId, 'event.view');
    return prisma.siteVisit.findMany({
      where: { eventId: input.eventId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, vendorOrgId: true, spaceId: true, proposedTimes: true, confirmedAt: true, status: true, notes: true },
    });
  }
  if (input.vendorOrgId) {
    const membership = await prisma.membership.findFirst({
      where: { userId: actor.userId, orgId: input.vendorOrgId },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenError('Only the venue team lists site visits');
    return prisma.siteVisit.findMany({
      where: { vendorOrgId: input.vendorOrgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        eventId: true,
        vendorOrgId: true,
        spaceId: true,
        proposedTimes: true,
        confirmedAt: true,
        status: true,
        notes: true,
        event: { select: { name: true, startsAt: true } },
      },
    });
  }
  throw new ValidationError('Pass an event or a business', { key: 'scopeRequired' });
}
