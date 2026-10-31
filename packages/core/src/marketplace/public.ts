import { prisma } from '@tiwa/db';
import { VENDOR_CATEGORIES } from '@tiwa/config';
import { NotFoundError } from '../shared/errors.js';

// Public marketplace profiles (MKT-07, P6-T04). Only published profiles are
// visible; contact details never leave the server on these queries —
// guests talk to businesses through Tiwa chat (P6-T17), not direct contacts.

export type PublicProfileKind = 'VENDOR' | 'PLANNER';

export async function getPublicProfile(slug: string, kind: PublicProfileKind) {
  const org = await prisma.organization.findUnique({ where: { slug, kind, deletedAt: null } });
  if (!org) throw new NotFoundError('Profile not found');
  return getPublicProfileForOrg(org.id, kind);
}

/** Cheap slug → orgId lookup so the cached page body is keyed without a full read. */
export async function resolvePublicOrgId(slug: string, kind: PublicProfileKind): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { slug, kind, deletedAt: null }, select: { id: true } });
  if (!org) throw new NotFoundError('Profile not found');
  return org.id;
}

export async function getPublicProfileForOrg(orgId: string, kind: PublicProfileKind) {
  const org = await prisma.organization.findUnique({ where: { id: orgId, kind, deletedAt: null } });
  if (!org) throw new NotFoundError('Profile not found');
  const profile = await prisma.businessProfile.findUnique({ where: { orgId: org.id } });
  if (!profile?.published) throw new NotFoundError('Profile not found');
  const [packages, portfolio, verification] = await Promise.all([
    prisma.servicePackage.findMany({ where: { orgId: org.id, active: true }, orderBy: { name: 'asc' } }),
    prisma.portfolioItem.findMany({ where: { orgId: org.id }, orderBy: { sortOrder: 'asc' } }),
    prisma.businessVerification.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  const categoryLabels = profile.categories.map(
    (key) => VENDOR_CATEGORIES[key as keyof typeof VENDOR_CATEGORIES] ?? key,
  );
  return {
    org: { id: org.id, name: org.name, slug: org.slug, kind: org.kind, city: org.city, verification: org.verification },
    profile: {
      bio: profile.bio,
      city: profile.city,
      serviceAreaKm: profile.serviceAreaKm,
      categories: profile.categories,
      categoryLabels,
      startingPriceMinor: profile.startingPriceMinor?.toString() ?? null,
      currency: profile.currency,
      travelFeeNote: profile.travelFeeNote,
      allowGuestEnquiries: profile.allowGuestEnquiries,
      ratingAvg: profile.ratingAvg,
      ratingCount: profile.ratingCount,
      completedBookings: profile.completedBookings,
      availabilityConfirmedAt: profile.availabilityConfirmedAt,
    },
    packages: packages.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      priceMinor: row.priceMinor?.toString() ?? null,
      currency: row.currency,
      includes: row.includes,
      addOns: Array.isArray(row.addOns) ? (row.addOns as string[]) : [],
    })),
    portfolio: portfolio.map((row) => ({ id: row.id, key: row.key, caption: row.caption })),
    verified: verification?.status === 'APPROVED',
  };
}

export type PublicProfile = Awaited<ReturnType<typeof getPublicProfile>>;

/** Public blocked dates (YYYY-MM-DD) for the mini-calendar. Booking holds (P7) also appear here. */
export async function getPublicAvailability(orgId: string, from: string, to: string): Promise<string[]> {
  const rows = await prisma.availabilityBlock.findMany({
    where: { orgId, date: { gte: new Date(from), lte: new Date(to) } },
    select: { date: true },
  });
  return rows.map((row) => row.date.toISOString().slice(0, 10));
}

/** Storage key for a portfolio photo, only when the owner's profile is published (used by the redirect route). */
export async function getPublicPhotoKey(itemId: string): Promise<string> {
  const item = await prisma.portfolioItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Photo not found');
  const profile = await prisma.businessProfile.findUnique({ where: { orgId: item.orgId } });
  if (!profile?.published) throw new NotFoundError('Photo not found');
  return item.key;
}
