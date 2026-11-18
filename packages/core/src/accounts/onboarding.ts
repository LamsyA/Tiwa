import { currencyForCountry } from '@tiwa/config';
import { normaliseEmail, toE164 } from '../shared/contact.js';
import { authorizeOrg } from '../auth/org.js';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { ConflictError } from '../shared/errors.js';
import { uniqueSlug } from '../shared/ids.js';

// Accounts module: onboarding (UF-01 steps 3–6, ACC-02, ACC-03).
// Validation messages are message keys (`onboarding.errors.*` in
// messages/en.json), never user-facing English.

/** Only same-origin relative paths survive; anything else falls back. Blocks open redirects. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

export type OnboardingDecision = { done: true; to: string } | { done: false; step: 'role' };

export interface ProfileState {
  /** Set once the user picked host or created a business (D-X51). */
  onboardedAt: Date | null;
  membershipCount: number;
}

/**
 * Triage for /onboarding. Anyone already in an organisation or on an event
 * (owner or invited member, UF-01 step 6) is done, and so is anyone who
 * finished the role step. A name alone no longer counts (D-X51): Google and
 * password sign-ups arrive with one and were wrongly landing as hosts.
 */
export function triageOnboarding(state: ProfileState, next?: string | null): OnboardingDecision {
  if (state.membershipCount > 0 || state.onboardedAt) return { done: true, to: safeNextPath(next, '/home') };
  return { done: false, step: 'role' };
}

export const hostProfileSchema = z.object({
  name: z.string().trim().min(2, 'nameTooShort').max(80, 'nameTooLong'),
});

export async function completeHostProfile(
  userId: string,
  input: z.infer<typeof hostProfileSchema>,
): Promise<{ name: string }> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: input.name, onboardedAt: new Date() },
  });
  return { name: user.name };
}

// Categories, business phone and logo are collected with the BusinessProfile
// (P6) and storage (P5); this step persists only Organization + OWNER (D-X06).
export const businessSchema = z.object({
  kind: z.enum(['PLANNER', 'VENDOR']),
  name: z.string().trim().min(2, 'businessNameTooShort').max(120, 'businessNameTooLong'),
  city: z.string().trim().min(2, 'cityTooShort').max(80, 'cityTooLong'),
  /** D-X90: how clients and Tiwa reach the business (WhatsApp, email). */
  phone: z.string().trim().min(1, 'phoneRequired').max(30),
  email: z.string().trim().min(1, 'emailRequired').max(160),
  /** Optional owner name for users who skipped the host profile step. */
  ownerName: z.string().trim().min(2, 'nameTooShort').max(80, 'nameTooLong').optional(),
});

/** Creates the Organization with the caller as OWNER, in one transaction (UF-01-3). */
export async function completeBusinessOnboarding(
  userId: string,
  input: z.infer<typeof businessSchema>,
): Promise<{ orgId: string }> {
  const country = (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { countryCode: true } }))
    .countryCode;
  const contactPhone = toE164(input.phone, country || 'NG');
  const contactEmail = normaliseEmail(input.email);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const existing = await tx.membership.count({ where: { userId, role: 'OWNER', org: { kind: input.kind } } });
    if (existing > 0) throw new ConflictError('Business already set up', { reason: 'org-exists' });
    const org = await tx.organization.create({
      data: {
        kind: input.kind,
        name: input.name,
        slug: uniqueSlug(input.name),
        countryCode: user.countryCode,
        city: input.city,
        contactPhone,
        contactEmail,
      },
    });
    await tx.membership.create({ data: { orgId: org.id, userId, role: 'OWNER' } });
    // A draft profile (D-X44): the owner fills in details and publishes
    // from Business profile when ready; publishing never needs every field.
    await tx.businessProfile.create({
      data: {
        orgId: org.id,
        categories: [],
        city: input.city,
        currency: currencyForCountry(user.countryCode),
        published: false,
        searchText: [input.name, input.city].join(' ').toLowerCase(),
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { onboardedAt: new Date(), ...(input.ownerName ? { name: input.ownerName } : {}) },
    });
    return { orgId: org.id };
  });
}

export const businessContactSchema = z.object({
  orgId: z.string().uuid(),
  phone: z.string().trim().min(1, 'phoneRequired').max(30),
  email: z.string().trim().min(1, 'emailRequired').max(160),
});

/** D-X90: set the business phone and email (owner/admin). */
export async function updateBusinessContact(
  actor: { kind: 'user'; userId: string; isAdmin: boolean },
  raw: z.input<typeof businessContactSchema>,
): Promise<void> {
  const input = businessContactSchema.parse(raw);
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: input.orgId, userId: actor.userId } },
  });
  authorizeOrg(actor, 'org.manage', input.orgId, membership ? { orgId: input.orgId, role: membership.role } : null);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: input.orgId },
    select: { countryCode: true },
  });
  await prisma.organization.update({
    where: { id: input.orgId },
    data: { contactPhone: toE164(input.phone, org.countryCode || 'NG'), contactEmail: normaliseEmail(input.email) },
  });
}

/** D-X90: the planner/vendor business this person must finish contact details for, if any. */
export async function missingBusinessContact(
  userId: string,
): Promise<{ orgId: string; name: string; phone: string | null; email: string | null } | null> {
  const rows = await prisma.membership.findMany({
    where: {
      userId,
      role: { in: ['OWNER', 'ADMIN'] },
      org: {
        deletedAt: null,
        kind: { in: ['PLANNER', 'VENDOR'] },
        OR: [{ contactPhone: null }, { contactEmail: null }],
      },
    },
    select: { org: { select: { id: true, name: true, contactPhone: true, contactEmail: true } } },
    take: 1,
  });
  const org = rows[0]?.org;
  return org ? { orgId: org.id, name: org.name, phone: org.contactPhone, email: org.contactEmail } : null;
}
