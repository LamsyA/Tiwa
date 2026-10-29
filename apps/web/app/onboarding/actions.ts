'use server';

import {
  UnauthenticatedError,
  businessSchema,
  completeBusinessOnboarding,
  completeHostProfile,
  hostProfileSchema,
  isDomainError,
} from '@tiwa/core';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth.js';

/** Field errors carry message keys from `onboarding.errors.*`. */
export type OnboardingResult = { ok: true } | { ok: false; code: string; fieldErrors?: Record<string, string[]> };

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new UnauthenticatedError();
  return session.user.id as string;
}

function failure(error: unknown): OnboardingResult {
  if (isDomainError(error)) return { ok: false, code: error.code };
  throw error;
}

export async function saveHostProfile(raw: unknown): Promise<OnboardingResult> {
  const input = hostProfileSchema.safeParse(raw);
  if (!input.success) return { ok: false, code: 'VALIDATION', fieldErrors: input.error.flatten().fieldErrors };
  try {
    await completeHostProfile(await requireUserId(), input.data);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function saveBusinessProfile(raw: unknown): Promise<OnboardingResult> {
  const input = businessSchema.safeParse(raw);
  if (!input.success) return { ok: false, code: 'VALIDATION', fieldErrors: input.error.flatten().fieldErrors };
  try {
    await completeBusinessOnboarding(await requireUserId(), input.data);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
