import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { compareQuotes } from './decisions.js';

// Host-side category overview (P7-T05): shortlist, requests and quotes for
// one vendor category in one payload, so the event vendors board can show
// quoting state per category without N+1 reads.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const categoryOverviewSchema = z.object({
  eventId: z.string().uuid(),
  category: z.string().min(1).max(60),
});

export async function getCategoryOverview(actor: UserActor, raw: z.infer<typeof categoryOverviewSchema>) {
  const input = categoryOverviewSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.view');

  const picks = await prisma.shortlist.findMany({
    where: { eventId: input.eventId },
    orderBy: { id: 'asc' },
    select: { orgId: true },
  });
  const orgs = picks.length
    ? await prisma.organization.findMany({
        where: { id: { in: picks.map((pick) => pick.orgId) }, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          profile: { select: { categories: true, city: true, startingPriceMinor: true, currency: true } },
        },
      })
    : [];
  const byId = new Map(orgs.map((org) => [org.id, org]));
  const shortlisted = picks.flatMap((pick) => {
    const org = byId.get(pick.orgId);
    if (!org || !org.profile?.categories.includes(input.category)) return [];
    return [
      {
        orgId: org.id,
        name: org.name,
        slug: org.slug,
        city: org.profile.city,
        startingPriceMinor: org.profile.startingPriceMinor?.toString() ?? null,
        currency: org.profile.currency,
      },
    ];
  });

  const requests = await prisma.quoteRequest.findMany({
    where: { eventId: input.eventId, category: input.category },
    orderBy: { createdAt: 'desc' },
    select: { id: true, vendorOrgId: true, status: true, createdAt: true },
  });
  const requestedNames = requests.length
    ? await prisma.organization.findMany({
        where: { id: { in: [...new Set(requests.map((row) => row.vendorOrgId))] } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(requestedNames.map((org) => [org.id, org.name]));

  const quotes = await compareQuotes(actor, { eventId: input.eventId, category: input.category });
  const quoteCounts = new Map<string, number>();
  for (const quote of quotes) {
    quoteCounts.set(quote.vendorOrgId, (quoteCounts.get(quote.vendorOrgId) ?? 0) + 1);
  }

  return {
    shortlisted,
    requests: requests.map((row) => ({ ...row, orgName: names.get(row.vendorOrgId) ?? null })),
    quotes,
    counts: {
      shortlisted: shortlisted.length,
      requested: new Set(requests.filter((row) => row.status === 'OPEN' || row.status === 'QUOTED').map((row) => row.vendorOrgId)).size,
      quoted: quoteCounts.size,
    },
  };
}
