import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { NotFoundError } from '../shared/errors.js';

// Shortlist (MKT-05, P6-T06): per-event vendor picks, compared side by side.
// Any event member may keep a shortlist; reads use `event.view`.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const toggleShortlistSchema = z.object({ eventId: z.string().uuid(), orgId: z.string().uuid() });

export async function toggleShortlist(actor: UserActor, input: z.infer<typeof toggleShortlistSchema>) {
  await requireEventAccess(actor, input.eventId, 'event.view');
  const org = await prisma.organization.findUnique({ where: { id: input.orgId, deletedAt: null } });
  if (!org || (org.kind !== 'VENDOR' && org.kind !== 'PLANNER')) throw new NotFoundError('Business not found');
  const existing = await prisma.shortlist.findUnique({
    where: { eventId_orgId: { eventId: input.eventId, orgId: input.orgId } },
  });
  if (existing) {
    await prisma.shortlist.delete({ where: { id: existing.id } });
    return { shortlisted: false };
  }
  await prisma.shortlist.create({ data: { eventId: input.eventId, orgId: input.orgId } });
  return { shortlisted: true };
}

export const listShortlistSchema = z.object({ eventId: z.string().uuid() });

export async function listShortlist(actor: UserActor, input: z.infer<typeof listShortlistSchema>) {
  await requireEventAccess(actor, input.eventId, 'event.view');
  const picks = await prisma.shortlist.findMany({ where: { eventId: input.eventId }, orderBy: { id: 'asc' } });
  if (picks.length === 0) return [];
  const orgs = await prisma.organization.findMany({
    where: { id: { in: picks.map((row) => row.orgId) } },
    select: {
      id: true,
      name: true,
      slug: true,
      kind: true,
      profile: {
        select: {
          categories: true,
          city: true,
          startingPriceMinor: true,
          currency: true,
          ratingAvg: true,
          ratingCount: true,
          published: true,
        },
      },
    },
  });
  const byId = new Map(orgs.map((org) => [org.id, org]));
  return picks.flatMap((pick) => {
    const org = byId.get(pick.orgId);
    return org ? [{ ...pick, org }] : [];
  });
}
