import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';

// Venue search (MKT-03 venues, P6-T09). Coarse DB filter (published venue
// profiles, active spaces with enough capacity) plus fine JS filtering for
// the date/slot blocks and slot prices, which don't fit a single indexed
// query. Candidate sets are small (tens of venues), so pagination slices
// after filtering; the <300 ms gate applies to vendor search (T10), not here.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const searchVenuesSchema = z.object({
  q: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  slot: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY']).optional(),
  guests: z.number().int().min(1).max(100000).optional(),
  indoor: z.boolean().optional(),
  amenities: z.array(z.string()).max(20).default([]),
  maxPriceMinor: z.string().regex(/^\d+$/).optional(),
  verifiedOnly: z.boolean().default(false),
  take: z.number().int().min(1).max(50).default(20),
});

export interface VenueHit {
  orgId: string;
  slug: string;
  name: string;
  city: string;
  currency: string;
  verified: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  completedBookings: number;
  spaces: {
    id: string;
    name: string;
    indoor: boolean;
    capacitySeated: number | null;
    capacityTheatre: number | null;
    capacityStanding: number | null;
    sizeSqm: number | null;
    amenities: string[];
    slotPriceMinor: string | null;
    photoIds: string[];
    fromMinor: string | null;
  }[];
}

export async function searchVenues(
  actor: UserActor,
  raw: z.input<typeof searchVenuesSchema>,
): Promise<{ hits: VenueHit[] }> {
  const input = searchVenuesSchema.parse(raw);
  void actor;

  const profiles = await prisma.businessProfile.findMany({
    where: {
      published: true,
      categories: { has: 'venue' },
      org: {
        kind: 'VENDOR',
        deletedAt: null,
        ...(input.verifiedOnly ? { verification: 'APPROVED' as const } : {}),
      },
      ...(input.city ? { city: { contains: input.city, mode: 'insensitive' as const } } : {}),
      ...(input.q
        ? {
            OR: [
              { searchText: { contains: input.q, mode: 'insensitive' as const } },
              { city: { contains: input.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    take: 200,
    select: {
      orgId: true,
      city: true,
      currency: true,
      ratingAvg: true,
      ratingCount: true,
      completedBookings: true,
      org: { select: { name: true, slug: true, verification: true } },
      spaces: {
        where: {
          active: true,
          ...(input.indoor !== undefined ? { indoor: input.indoor } : {}),
          ...(input.guests
            ? {
                OR: [
                  { capacitySeated: { gte: input.guests } },
                  { capacityTheatre: { gte: input.guests } },
                  { capacityStanding: { gte: input.guests } },
                ],
              }
            : {}),
          ...(input.amenities.length > 0 ? { amenities: { hasEvery: input.amenities } } : {}),
        },
        select: {
          id: true,
          name: true,
          indoor: true,
          capacitySeated: true,
          capacityTheatre: true,
          capacityStanding: true,
          sizeSqm: true,
          amenities: true,
          slotPrices: true,
          photoKeys: true,
        },
      },
    },
  });

  // Date/slot blocks (whole-business FULL_DAY or per-space) remove spaces.
  const blockedBySpace = new Map<string, Set<string>>();
  const blockedOrgIds = new Set<string>();
  if (input.date) {
    const blocks = await prisma.availabilityBlock.findMany({
      where: { orgId: { in: profiles.map((p) => p.orgId) }, date: new Date(input.date) },
      select: { orgId: true, spaceId: true, slot: true },
    });
    const slot = input.slot ?? 'FULL_DAY';
    for (const block of blocks) {
      const covers = block.slot === 'FULL_DAY' || block.slot === slot || slot === 'FULL_DAY';
      if (!covers) continue;
      if (block.spaceId === null) blockedOrgIds.add(block.orgId);
      else {
        const set = blockedBySpace.get(block.orgId) ?? new Set<string>();
        set.add(block.spaceId);
        blockedBySpace.set(block.orgId, set);
      }
    }
  }

  const slotPricesOf = (space: { slotPrices: unknown }): Record<string, string> =>
    (space.slotPrices ?? {}) as Record<string, string>;

  const hits: VenueHit[] = [];
  for (const profile of profiles) {
    if (blockedOrgIds.has(profile.orgId)) continue;
    const blockedSpaces = blockedBySpace.get(profile.orgId) ?? new Set<string>();
    const slot = input.slot;
    const spaces = profile.spaces
      .filter((space) => !blockedSpaces.has(space.id))
      .map((space) => ({ ...space, slotPriceMinor: slot ? (slotPricesOf(space)[slot] ?? null) : null }))
      .filter((space) => {
        if (input.maxPriceMinor && slot) {
          if (space.slotPriceMinor === null) return false;
          try {
            if (BigInt(space.slotPriceMinor) > BigInt(input.maxPriceMinor)) return false;
          } catch {
            return false;
          }
        }
        return true;
      });
    if (spaces.length === 0) continue;
    hits.push({
      orgId: profile.orgId,
      slug: profile.org.slug,
      name: profile.org.name,
      city: profile.city,
      currency: profile.currency,
      verified: profile.org.verification === 'APPROVED',
      ratingAvg: profile.ratingAvg,
      ratingCount: profile.ratingCount,
      completedBookings: profile.completedBookings,
      spaces: spaces.map((space) => ({
        id: space.id,
        name: space.name,
        indoor: space.indoor,
        capacitySeated: space.capacitySeated,
        capacityTheatre: space.capacityTheatre,
        capacityStanding: space.capacityStanding,
        sizeSqm: space.sizeSqm,
        amenities: space.amenities,
        slotPriceMinor: space.slotPriceMinor,
        /** Last path segment of each uploaded photo, served by /api/space-photo (D-X43). */
        photoIds: space.photoKeys.map((key) => key.split('/').pop() ?? key).slice(0, 6),
        fromMinor:
          Object.values(slotPricesOf(space))
            .filter((value) => /^\d+$/.test(value))
            .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))[0] ?? null,
      })),
    });
    if (hits.length >= input.take) break;
  }
  return { hits };
}
