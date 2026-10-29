import { triageOnboarding } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth.js';

/** Triage: finished profiles and invited members bounce to their destination; the rest pick a role. */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect(`/login?next=${encodeURIComponent('/onboarding')}`);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id as string },
    select: { name: true, phone: true, _count: { select: { memberships: true } } },
  });
  const decision = triageOnboarding(
    { name: user.name, phone: user.phone, membershipCount: user._count.memberships },
    next,
  );
  if (decision.done) redirect(decision.to);
  redirect(next ? `/onboarding/role?next=${encodeURIComponent(next)}` : '/onboarding/role');
}
