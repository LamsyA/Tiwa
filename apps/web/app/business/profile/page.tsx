import {
  getBusinessProfile,
  getChecklist,
  getVerification,
  listMyOrgs,
  listVendorPortfolio,
  momentsSourceEvents,
  payoutAccount,
} from '@tiwa/core';
import { ACCOUNT_NUMBER_PATTERN, bankName, banksFor } from '@tiwa/config';
import { Banner, Card, EmptyState, StatusPill } from '@tiwa/ui';
import { Check, Circle, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';
import { AvailabilityManager } from './availability-manager.js';
import { PackagesEditor } from './packages-editor.js';
import { PayoutAccount } from './payout-account.js';
import { PortfolioManager } from './portfolio-manager.js';
import { MomentsSourcePicker } from './moments-source.js';
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
  const [profile, checklist, verification, bank] = await Promise.all([
    getBusinessProfile(ctx.actor, current.org.id),
    getChecklist(ctx.actor, current.org.id),
    getVerification(ctx.actor, current.org.id),
    payoutAccount(ctx.actor, current.org.id).catch(() => null),
  ]);
  const country = current.org.countryCode;
  const numberPattern = ACCOUNT_NUMBER_PATTERN[country]?.source.match(/\{(\d+)\}/)?.[1];
  const storage = privateStorage();
  const photos = await Promise.all(
    profile.portfolio.map(async (item) => ({
      id: item.id,
      url: await storage.getSignedUrl(item.key, 3600),
      caption: item.caption,
    })),
  );
  const [sourceEvents, vendorItems] = await Promise.all([
    momentsSourceEvents(current.org.id),
    listVendorPortfolio(ctx.actor, current.org.id).catch(() => []),
  ]);
  const pendingIds = new Set(
    vendorItems.filter((row) => row.mediaItemId && !row.approvedAt).map((row) => row.mediaItemId as string),
  );
  const sources = await Promise.all(
    sourceEvents.map(async (event) => ({
      eventId: event.eventId,
      eventName: event.eventName,
      items: await Promise.all(
        event.items
          .filter((item) => !vendorItems.some((row) => row.mediaItemId === item.id && row.approvedAt))
          .map(async (item) => ({
            id: item.id,
            thumbUrl: item.thumbKey ? await storage.getSignedUrl(item.thumbKey, 3600) : null,
          })),
      ),
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
    { key: 'stepBank', done: checklist.bank },
  ];
  const doneCount = steps.filter((step) => step.done).length;

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
        <section
          aria-labelledby="checklist-heading"
          className="border-border/70 bg-surface relative overflow-hidden rounded-3xl border p-5 shadow-[var(--shadow-1)] sm:p-6"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-[var(--brand)]/10 blur-3xl"
          />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="checklist-heading" className="font-display text-xl font-bold tracking-tight">
                {t('checklistHeading')}
              </h2>
              <p className="text-muted mt-1 text-sm">{t('checklistBody')}</p>
            </div>
            <div
              role="img"
              aria-label={t('checklistProgress', { done: doneCount, total: steps.length })}
              className="grid size-14 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--brand) ${(doneCount / steps.length) * 360}deg, var(--surface-2) 0deg)`,
              }}
            >
              <span className="bg-surface font-display grid size-11 place-items-center rounded-full text-sm font-bold tabular-nums">
                {doneCount}/{steps.length}
              </span>
            </div>
          </div>
          {profile.profile?.published && (
            <Banner tone="info" className="mt-4">
              {t('liveBanner')}
            </Banner>
          )}
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {steps.map((step) => (
              <li
                key={step.key}
                className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm ${
                  step.done ? 'bg-surface-2/60' : 'border-border/70 border'
                }`}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-white ${
                    step.done
                      ? 'bg-success'
                      : 'review' in step && step.review
                        ? 'bg-warning'
                        : 'bg-surface-2 text-muted'
                  }`}
                >
                  {step.done ? <Check aria-hidden className="size-3.5" /> : <Circle aria-hidden className="size-2.5" />}
                </span>
                <span className={`flex-1 ${step.done ? 'text-muted' : 'font-medium'}`}>{t(step.key)}</span>
                {!step.done && 'review' in step && step.review && (
                  <StatusPill tone="warning">{t('pending')}</StatusPill>
                )}
              </li>
            ))}
          </ul>
          {current.role !== 'STAFF' && profile.profile?.categories.includes('venue') && (
            <p className="mt-4 text-sm">
              <Link href={`/business/spaces?org=${current.org.id}`} className="text-brand-strong font-medium underline">
                {tm('spacesTitle')}
              </Link>
            </p>
          )}
        </section>
        {!canManage && <Banner tone="warning">{t('forbiddenBody')}</Banner>}
        {canManage && (
          <>
            <PublishManager
              orgId={current.org.id}
              published={profile.profile?.published ?? false}
              publishable={checklist.publishable}
              verificationStatus={verification?.status ?? null}
            />
            <ProfileForm
              orgId={current.org.id}
              kind={current.org.kind === 'PLANNER' ? 'PLANNER' : 'VENDOR'}
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
            <MomentsSourcePicker
              orgId={current.org.id}
              events={sources.filter((event) => event.items.length > 0)}
              pendingIds={[...pendingIds]}
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
            <PayoutAccount
              orgId={current.org.id}
              canEdit={current.role === 'OWNER'}
              banks={banksFor(country)}
              pattern={numberPattern ? Number(numberPattern) : null}
              account={
                bank
                  ? {
                      id: bank.id,
                      bankName: bankName(country, bank.bankCode),
                      last4: bank.accountNumberLast4,
                      accountName: bank.accountName,
                      verified: bank.verifiedAt !== null,
                    }
                  : null
              }
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
