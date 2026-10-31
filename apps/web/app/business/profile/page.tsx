import { getBusinessProfile, getChecklist, getVerification, listMyOrgs } from '@tiwa/core';
import { Banner, Card, EmptyState, StatusPill } from '@tiwa/ui';
import { Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';
import { AvailabilityManager } from './availability-manager.js';
import { PackagesEditor } from './packages-editor.js';
import { PortfolioManager } from './portfolio-manager.js';
import { ProfileForm } from './profile-form.js';
import { PublishManager } from './publish-manager.js';

/** MKT-01, P6-T02: business profile editing with a publish-readiness checklist. */
export default async function BusinessProfilePage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org: orgParam } = await searchParams;
  const ctx = await requirePageUser('/business/profile');
  const t = await getTranslations('business');
  const tm = await getTranslations('marketplace');
  const mine = (await listMyOrgs(ctx.actor.userId)).filter(
    (row) => row.org.kind === 'VENDOR' || row.org.kind === 'PLANNER',
  );
  const current = mine.find((row) => row.org.id === orgParam) ?? mine[0];
  if (!current) {
    return (
      <AppFrame userId={ctx.actor.userId} active="business" title={t('title')}>
        <EmptyState
          icon={<Users className="size-8" aria-hidden />}
          title={t('noOrgTitle')}
          body={t('noOrgBody')}
          action={
            <Link href="/onboarding/role" className="font-medium underline">
              {t('noOrgAction')}
            </Link>
          }
        />
      </AppFrame>
    );
  }

  const canManage = current.role === 'OWNER' || current.role === 'ADMIN';
  const [profile, checklist, verification] = await Promise.all([
    getBusinessProfile(ctx.actor, current.org.id),
    getChecklist(ctx.actor, current.org.id),
    getVerification(ctx.actor, current.org.id),
  ]);
  const storage = privateStorage();
  const photos = await Promise.all(
    profile.portfolio.map(async (item) => ({
      id: item.id,
      url: await storage.getSignedUrl(item.key, 3600),
      caption: item.caption,
    })),
  );

  const steps = [
    { key: 'stepProfile', done: checklist.profile },
    { key: 'stepPortfolio', done: checklist.portfolio },
    { key: 'stepPackages', done: checklist.packages },
    { key: 'stepAvailability', done: checklist.availability },
    {
      key: 'stepVerification',
      done: checklist.verification === 'APPROVED',
      review: checklist.verification === 'PENDING',
    },
    { key: 'stepBank', done: false, soon: true },
  ];

  return (
    <AppFrame userId={ctx.actor.userId} active="business" title={t('title')}>
      <div className="flex flex-col gap-4 py-4">
        {mine.length > 1 && (
          <nav aria-label={t('orgSwitch')} className="flex flex-wrap gap-2">
            {mine.map((row) => (
              <Link
                key={row.org.id}
                href={`/business/profile?org=${row.org.id}`}
                aria-current={row.org.id === current.org.id ? 'page' : undefined}
                className={row.org.id === current.org.id ? 'font-medium underline' : 'text-muted underline'}
              >
                {row.org.name}
              </Link>
            ))}
          </nav>
        )}
        <Card>
          <div className="flex flex-col gap-2 p-4">
            <h2 className="font-medium">{t('checklistHeading')}</h2>
            <p className="text-muted text-sm">{t('checklistBody')}</p>
            {checklist.publishable && <Banner tone="info">{t('live')}</Banner>}
            <ul className="flex flex-col gap-2">
              {steps.map((step) => (
                <li key={step.key} className="flex items-center gap-3 text-sm">
                  <StatusPill tone={'soon' in step ? 'neutral' : step.done ? 'success' : 'warning'}>
                    {'soon' in step ? t('comingSoon') : step.done ? t('done') : t('pending')}
                  </StatusPill>
                  <span>{t(step.key)}</span>
                </li>
              ))}
            </ul>
            {current.role !== 'STAFF' && profile.profile?.categories.includes('venue') && (
              <p className="mt-2 text-sm">
                <Link href={`/business/spaces?org=${current.org.id}`} className="underline">
                  {tm('spacesTitle')}
                </Link>
              </p>
            )}
          </div>
        </Card>
        {!canManage && <Banner tone="warning">{t('forbiddenBody')}</Banner>}
        {canManage && (
          <>
            <ProfileForm
              orgId={current.org.id}
              initial={
                profile.profile
                  ? {
                      categories: profile.profile.categories,
                      bio: profile.profile.bio,
                      city: profile.profile.city,
                      serviceAreaKm: profile.profile.serviceAreaKm,
                      startingPriceMinor: profile.profile.startingPriceMinor?.toString() ?? null,
                      currency: profile.profile.currency,
                      travelFeeNote: profile.profile.travelFeeNote,
                      allowGuestEnquiries: profile.profile.allowGuestEnquiries,
                    }
                  : null
              }
            />
            <PortfolioManager
              orgId={current.org.id}
              photos={photos}
              needed={Math.max(0, 6 - checklist.portfolioCount)}
            />
            <PackagesEditor
              orgId={current.org.id}
              packages={profile.packages.map((row) => ({
                id: row.id,
                name: row.name,
                description: row.description,
                priceMinor: row.priceMinor?.toString() ?? null,
                currency: row.currency,
                includes: row.includes,
                addOns: Array.isArray(row.addOns) ? (row.addOns as string[]) : [],
                active: row.active,
              }))}
            />
            <AvailabilityManager
              orgId={current.org.id}
              blocks={profile.blocks.map((row) => ({
                id: row.id,
                date: row.date.toISOString(),
                reason: row.reason,
              }))}
              confirmedAt={profile.profile?.availabilityConfirmedAt?.toISOString() ?? null}
              stale={!checklist.availability}
            />
            <PublishManager
              orgId={current.org.id}
              published={profile.profile?.published ?? false}
              publishable={checklist.publishable}
              verificationStatus={verification?.status ?? null}
            />
            <Card>
              <div className="flex flex-col gap-1 p-4">
                <h3 className="font-medium">{t('bankHeading')}</h3>
                <p className="text-muted text-sm">{t('bankComing')}</p>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppFrame>
  );
}
