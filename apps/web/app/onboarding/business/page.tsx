import { safeNextPath } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth.js';
import { BusinessForm } from '../forms.js';

/** UF-01 step 5: planner or vendor business → Organization + OWNER → /home. */
export default async function BusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const { role, next } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect(`/login?next=${encodeURIComponent('/onboarding')}`);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id as string },
    select: { name: true, phone: true },
  });
  // Phone sign-ups still carry their number as a name; ask for a real one here.
  const askName = !user.name.trim() || user.name === user.phone;
  return (
    <BusinessForm
      kind={role === 'vendor' ? 'VENDOR' : 'PLANNER'}
      next={safeNextPath(next, '/home')}
      askName={askName}
    />
  );
}
