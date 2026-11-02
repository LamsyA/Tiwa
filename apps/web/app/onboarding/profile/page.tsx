import { safeNextPath } from '@tiwa/core';
import { getTranslations } from 'next-intl/server';
import { OnboardingFrame } from '@/components/onboarding-frame.js';
import { HostProfileForm } from '../forms.js';

/** UF-01 step 4: host name, then on to creating the first event. Photo upload arrives with storage (P5). */
export default async function HostProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations('onboarding');
  return (
    <OnboardingFrame step={2} eyebrow={t('roleHostTag')} title={t('hostTitle')} body={t('hostBody')}>
      <HostProfileForm next={safeNextPath(next, '/events/new')} />
    </OnboardingFrame>
  );
}
