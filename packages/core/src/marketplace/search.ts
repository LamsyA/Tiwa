import { VENDOR_CATEGORIES } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';

// Marketplace search (MKT-03, P6-T05). Signed-in browsing only (shortlist and
// quote requests need a user); the profile pages themselves are public (T04).
// Filters: text (trigram-backed substring on searchText), category, city,
// price range, minimum rating, verified only, free on a date (whole-business
// blocks; P7 adds confirmed-booking exclusion, T08/T09 space-level).

type UserActor = Extract<Actor, { kind: 'user' }>;

export const searchMarketplaceSchema = z.object({
  kind: z.enum(['VENDOR', 'PLANNER']),
  q: z.string().trim().max(120).optional(),
  category: z.string().min(1).max(60).optional(),
  city: z.string().trim().max(120).optional(),
  minPriceMinor: z.string().regex(/^\d+$/).optional(),
  maxPriceMinor: z.string().regex(/^\d+$/).optional(),
  minRating: z.number().min(0).max(5).optional(),
  verifiedOnly: z.boolean().default(false),
  freeOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sort: z.enum(['rating', 'priceAsc', 'priceDesc', 'recent']).default('rating'),
  take: z.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export interface SearchHit {
  orgId: string;
  slug: string;
  name: string;
  city: string;
  categories: string[];
  categoryLabels: string[];
  startingPriceMinor: string | null;
  currency: string;
  ratingAvg: number | null;
  ratingCount: number;
  verified: boolean;
  availabilityFresh: boolean;
}

const AVAILABILITY_FRESH_MS = 14 * 86_400_000;

export async function searchMarketplace(
  actor: UserActor,
  raw: z.input<typeof searchMarketplaceSchema>,
): Promise<{ hits: SearchHit[]; nextCursor: string | null }> {
  const input = searchMarketplaceSchema.parse(raw);
  void actor;
  const categoryLabels = (keys: string[]) =>
    keys.map((key) => VENDOR_CATEGORIES[key as keyof typeof VENDOR_CATEGORIES] ?? key);

  let blockedOrgIds: string[] = [];
  if (input.freeOn) {
    const blocks = await prisma.availabilityBlock.findMany({
      where: { date: new Date(input.freeOn), slot: 'FULL_DAY', spaceId: null },
      select: { orgId: true },
    });
    blockedOrgIds = [...new Set(blocks.map((row) => row.orgId))];
  }

  const orderBy =
    input.sort === 'priceAsc'
      ? [{ startingPriceMinor: 'asc' as const }, { id: 'asc' as const }]
      : input.sort === 'priceDesc'
        ? [{ startingPriceMinor: 'desc' as const }, { id: 'asc' as const }]
        : input.sort === 'recent'
          ? [{ org: { createdAt: 'desc' as const } }, { id: 'asc' as const }]
          : // Ties (e.g. no reviews yet) go to the newest business, so new listings surface.
            [
              { ratingAvg: { sort: 'desc' as const, nulls: 'last' as const } },
              { ratingCount: 'desc' as const },
              { org: { createdAt: 'desc' as const } },
              { id: 'asc' as const },
            ];

  const rows = await prisma.businessProfile.findMany({
    where: {
      published: true,
      org: {
        kind: input.kind,
        deletedAt: null,
        ...(input.verifiedOnly ? { verification: 'APPROVED' as const } : {}),
      },
      ...(input.category ? { categories: { has: input.category } } : {}),
      ...(input.city ? { city: { contains: input.city, mode: 'insensitive' as const } } : {}),
      ...(input.q
        ? {
            OR: [
              { searchText: { contains: input.q, mode: 'insensitive' as const } },
              { city: { contains: input.q, mode: 'insensitive' as const } },
              // Business name and @handle (slug), so a just-published business is findable by name.
              { org: { name: { contains: input.q, mode: 'insensitive' as const } } },
              { org: { slug: { contains: input.q.replace(/^@/, '').toLowerCase() } } },
            ],
          }
        : {}),
      ...(input.minPriceMinor || input.maxPriceMinor
        ? {
            startingPriceMinor: {
              ...(input.minPriceMinor ? { gte: BigInt(input.minPriceMinor) } : {}),
              ...(input.maxPriceMinor ? { lte: BigInt(input.maxPriceMinor) } : {}),
            },
          }
        : {}),
      ...(input.minRating !== undefined ? { ratingAvg: { gte: input.minRating } } : {}),
      ...(blockedOrgIds.length > 0 ? { orgId: { notIn: blockedOrgIds } } : {}),
    },
    orderBy,
    take: input.take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      orgId: true,
      categories: true,
      city: true,
      startingPriceMinor: true,
      currency: true,
      ratingAvg: true,
      ratingCount: true,
      availabilityConfirmedAt: true,
      org: { select: { name: true, slug: true, verification: true } },
    },
  });

  const page = rows.slice(0, input.take);
  return {
    hits: page.map((row) => ({
      orgId: row.orgId,
      slug: row.org.slug,
      name: row.org.name,
      city: row.city,
      categories: row.categories,
      categoryLabels: categoryLabels(row.categories),
      startingPriceMinor: row.startingPriceMinor?.toString() ?? null,
      currency: row.currency,
      ratingAvg: row.ratingAvg,
      ratingCount: row.ratingCount,
      verified: row.org.verification === 'APPROVED',
      availabilityFresh:
        Boolean(row.availabilityConfirmedAt) &&
        Date.now() - row.availabilityConfirmedAt!.getTime() < AVAILABILITY_FRESH_MS,
    })),
    nextCursor: rows.length > input.take ? page[page.length - 1]!.id : null,
  };
}

export interface BusinessLookupHit {
  orgId: string;
  slug: string;
  name: string;
  kind: 'VENDOR' | 'PLANNER';
  city: string;
  categoryLabel: string | null;
  verified: boolean;
}

/**
 * Find a published vendor or planner by name or @handle to message them
 * straight from the inbox (no marketplace detour). Exact handle first.
 */
export async function findBusinesses(raw: { q: string; take?: number }): Promise<BusinessLookupHit[]> {
  const q = raw.q.trim().replace(/^@/, '');
  if (q.length < 2) return [];
  const rows = await prisma.organization.findMany({
    where: {
      kind: { in: ['VENDOR', 'PLANNER'] },
      deletedAt: null,
      profile: { published: true },
      OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q.toLowerCase() } }],
    },
    orderBy: [{ name: 'asc' }],
    take: Math.min(raw.take ?? 12, 25),
    select: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      verification: true,
      profile: { select: { city: true, categories: true } },
    },
  });
  return rows
    .map((row) => ({
      orgId: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind as 'VENDOR' | 'PLANNER',
      city: row.profile?.city ?? '',
      categoryLabel: row.profile?.categories[0]
        ? (VENDOR_CATEGORIES[row.profile.categories[0] as keyof typeof VENDOR_CATEGORIES] ?? null)
        : null,
      verified: row.verification === 'APPROVED',
    }))
    .sort((a, b) => Number(b.slug === q.toLowerCase()) - Number(a.slug === q.toLowerCase()));
}
