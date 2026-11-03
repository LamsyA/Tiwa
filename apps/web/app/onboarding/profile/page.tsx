import { safeNextPath } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth.js';
import { OnboardingFrame } from '@/components/onboarding-frame.js';
import { HostProfileForm } from '../forms.js';

/** UF-01 step 4: host name, then on to creating the first event. Photo upload arrives with storage (P5). */
export default async function HostProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations('onboarding');
  // Google and password sign-ups already gave a name; offer it (D-X51).
  const session = await auth.api.getSession({ headers: await headers() });
  const me = session?.user
    ? await prisma.user.findUnique({ where: { id: session.user.id as string }, select: { name: true, phone: true } })
    : null;
  const defaultName = me?.name && me.name !== me.phone ? me.name : '';
  return (
    <OnboardingFrame step={2} eyebrow={t('roleHostTag')} title={t('hostTitle')} body={t('hostBody')}>
      <HostProfileForm next={safeNextPath(next, '/events/new')} defaultName={defaultName} />
    </OnboardingFrame>
  );
}
