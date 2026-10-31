import { prisma } from '@tiwa/db';
import { VENDOR_CATEGORIES } from '@tiwa/config';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg, type OrgAction } from '../auth/org.js';
import { ConflictError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Business profile (MKT-01, P6-T02). One profile per organisation; edits need
// org ADMIN+ (`org.manage`). The public page (P6-T04) reads the published row.

type UserActor = Extract<Actor, { kind: 'user' }>;

const CATEGORY_KEYS = Object.keys(VENDOR_CATEGORIES);

export const upsertBusinessProfileSchema = z.object({
  orgId: z.string().uuid(),
  categories: z.array(z.string()).min(1, 'categoriesRequired').max(5, 'categoriesTooMany'),
  bio: z.string().trim().max(2000, 'bioTooLong').optional(),
  city: z.string().trim().min(1, 'cityRequired').max(120, 'cityTooLong'),
  serviceAreaKm: z.number().int().min(0).max(1000).default(50),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  startingPriceMinor: z.string().regex(/^\d+$/, 'priceInvalid').optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currencyInvalid'),
  travelFeeNote: z.string().trim().max(500, 'travelFeeTooLong').optional(),
  allowGuestEnquiries: z.boolean().default(true),
});

async function loadAccess(actor: UserActor, orgId: string, action: OrgAction) {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: actor.userId } },
  });
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
}

/** Denormalised trigram-search text: org name + bio + city + category labels. */
export function buildSearchText(
  name: string,
  input: { bio?: string | undefined; city: string; categories: string[] },
): string {
  const labels = input.categories.map((key) => VENDOR_CATEGORIES[key as keyof typeof VENDOR_CATEGORIES] ?? key);
  return [name, input.bio ?? '', input.city, ...labels].join(' ').replace(/\s+/g, ' ').trim();
}

export async function upsertBusinessProfile(actor: UserActor, input: z.infer<typeof upsertBusinessProfileSchema>) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const unknown = input.categories.filter((key) => !CATEGORY_KEYS.includes(key));
  if (unknown.length > 0) throw new ConflictError('Unknown category', { reason: 'unknown-category', unknown });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: input.orgId } });

  const data = {
    categories: input.categories,
    bio: input.bio || null,
    city: input.city,
    serviceAreaKm: input.serviceAreaKm,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    startingPriceMinor: input.startingPriceMinor ? BigInt(input.startingPriceMinor) : null,
    currency: input.currency,
    travelFeeNote: input.travelFeeNote || null,
    allowGuestEnquiries: input.allowGuestEnquiries,
    searchText: buildSearchText(org.name, input),
  };
  return prisma.$transaction(async (tx) => {
    const profile = await tx.businessProfile.upsert({
      where: { orgId: input.orgId },
      create: { orgId: input.orgId, ...data },
      update: data,
    });
    await audit(tx, {
      actor,
      action: 'org.profile.upsert',
      targetType: 'Organization',
      targetId: input.orgId,
      data: { categories: input.categories, city: input.city },
    });
    return profile;
  });
}

export async function getBusinessProfile(actor: UserActor, orgId: string) {
  await loadAccess(actor, orgId, 'org.view');
  const [org, profile, packages, portfolio, blocks, verification] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
    prisma.businessProfile.findUnique({ where: { orgId } }),
    prisma.servicePackage.findMany({ where: { orgId }, orderBy: { name: 'asc' } }),
    prisma.portfolioItem.findMany({ where: { orgId }, orderBy: { sortOrder: 'asc' } }),
    prisma.availabilityBlock.findMany({ where: { orgId }, orderBy: { date: 'asc' } }),
    prisma.businessVerification.findFirst({ where: { orgId }, orderBy: { createdAt: 'desc' } }),
  ]);
  return { org, profile, packages, portfolio, blocks, verification };
}

export const publishProfileSchema = z.object({ orgId: z.string().uuid(), published: z.boolean() });

/** Publish gate (UF-13-1): profile + ≥6 portfolio + ≥1 package. Unpublishing is always allowed. */
export async function publishProfile(actor: UserActor, input: z.infer<typeof publishProfileSchema>) {
  await loadAccess(actor, input.orgId, 'org.manage');
  return prisma.$transaction(async (tx) => {
    if (input.published) {
      const [profile, portfolioCount, packageCount] = await Promise.all([
        tx.businessProfile.findUnique({ where: { orgId: input.orgId } }),
        tx.portfolioItem.count({ where: { orgId: input.orgId } }),
        tx.servicePackage.count({ where: { orgId: input.orgId, active: true } }),
      ]);
      const ready =
        Boolean(profile && profile.categories.length > 0 && profile.city) && portfolioCount >= 6 && packageCount >= 1;
      if (!ready) throw new ConflictError('Profile is not complete', { reason: 'profile-incomplete' });
    }
    const profile = await tx.businessProfile.upsert({
      where: { orgId: input.orgId },
      create: { orgId: input.orgId, categories: [], city: '', currency: 'NGN', published: input.published },
      update: { published: input.published },
    });
    await audit(tx, {
      actor,
      action: input.published ? 'org.profile.publish' : 'org.profile.unpublish',
      targetType: 'Organization',
      targetId: input.orgId,
      data: {},
    });
    return profile;
  });
}

export interface ProfileChecklist {
  profile: boolean;
  portfolio: boolean;
  packages: boolean;
  availability: boolean;
  verification: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  /** Bank account always false until P8 (payments.setupBankAccount). */
  bank: boolean;
  /** Publishable when Profile + Portfolio (≥6) + ≥1 Package are complete (UF-13-1). */
  publishable: boolean;
  portfolioCount: number;
}

const AVAILABILITY_FRESH_DAYS = 14;

export async function getChecklist(actor: UserActor, orgId: string): Promise<ProfileChecklist> {
  await loadAccess(actor, orgId, 'org.view');
  const [profile, portfolioCount, packageCount, verification] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { orgId } }),
    prisma.portfolioItem.count({ where: { orgId } }),
    prisma.servicePackage.count({ where: { orgId, active: true } }),
    prisma.businessVerification.findFirst({ where: { orgId }, orderBy: { createdAt: 'desc' } }),
  ]);
  const hasProfile = Boolean(profile && profile.categories.length > 0 && profile.city);
  const hasPortfolio = portfolioCount >= 6;
  const hasPackages = packageCount >= 1;
  const availability =
    Boolean(profile?.availabilityConfirmedAt) &&
    Date.now() - profile!.availabilityConfirmedAt!.getTime() < AVAILABILITY_FRESH_DAYS * 86_400_000;
  return {
    profile: hasProfile,
    portfolio: hasPortfolio,
    packages: hasPackages,
    availability,
    verification: verification?.status ?? 'NONE',
    bank: false,
    publishable: hasProfile && hasPortfolio && hasPackages,
    portfolioCount,
  };
}
