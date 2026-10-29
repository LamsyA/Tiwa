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
  name: string | null;
  phone: string | null;
  membershipCount: number;
}

/**
 * Triage for /onboarding. Anyone already in an organisation (owner or
 * invited member, UF-01 step 6) is done. A phone user whose name is still
 * their number, or a user with no name, has not onboarded yet.
 */
export function triageOnboarding(state: ProfileState, next?: string | null): OnboardingDecision {
  const hasRealName = Boolean(state.name?.trim()) && state.name !== state.phone;
  if (state.membershipCount > 0 || hasRealName) return { done: true, to: safeNextPath(next, '/home') };
  return { done: false, step: 'role' };
}

export const hostProfileSchema = z.object({
  name: z.string().trim().min(2, 'nameTooShort').max(80, 'nameTooLong'),
});

export async function completeHostProfile(
  userId: string,
  input: z.infer<typeof hostProfileSchema>,
): Promise<{ name: string }> {
  const user = await prisma.user.update({ where: { id: userId }, data: { name: input.name } });
  return { name: user.name };
}

// Categories, business phone and logo are collected with the BusinessProfile
// (P6) and storage (P5); this step persists only Organization + OWNER (D-X06).
export const businessSchema = z.object({
  kind: z.enum(['PLANNER', 'VENDOR']),
  name: z.string().trim().min(2, 'businessNameTooShort').max(120, 'businessNameTooLong'),
  city: z.string().trim().min(2, 'cityTooShort').max(80, 'cityTooLong'),
  /** Optional owner name for users who skipped the host profile step. */
  ownerName: z.string().trim().min(2, 'nameTooShort').max(80, 'nameTooLong').optional(),
});

/** Creates the Organization with the caller as OWNER, in one transaction (UF-01-3). */
export async function completeBusinessOnboarding(
  userId: string,
  input: z.infer<typeof businessSchema>,
): Promise<{ orgId: string }> {
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
      },
    });
    await tx.membership.create({ data: { orgId: org.id, userId, role: 'OWNER' } });
    if (input.ownerName) await tx.user.update({ where: { id: userId }, data: { name: input.ownerName } });
    return { orgId: org.id };
  });
}
