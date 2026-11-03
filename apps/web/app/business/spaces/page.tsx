import { getBusinessProfile, listMyOrgs, listSpaceAvailability, listSpaces } from '@tiwa/core';
import { Banner, EmptyState } from '@tiwa/ui';
import { Building2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';
import { SpacesManager, type SpaceRow } from './spaces-manager.js';

/** Venue spaces (P6-T08): venue-only. Other businesses get a pointer back to the profile editor. */
export default async function BusinessSpacesPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org: orgParam } = await searchParams;
  const ctx = await requirePageUser('/business/spaces');
  const t = await getTranslations('marketplace');
  const tb = await getTranslations('business');
  const mine = (await listMyOrgs(ctx.actor.userId)).filter((row) => row.org.kind === 'VENDOR');
  const current = mine.find((row) => row.org.id === orgParam) ?? mine[0];
  if (!current) {
    return (
      <AppFrame userId={ctx.actor.userId} active="business" title={t('spacesTitle')}>
        <EmptyState
          icon={<Building2 className="size-8" aria-hidden />}
          title={tb('noOrgTitle')}
          body={tb('noOrgBody')}
          action={
            <Link href="/onboarding/role" className="text-brand-strong font-semibold underline-offset-4 hover:underline">
              {tb('noOrgAction')}
            </Link>
          }
        />
      </AppFrame>
    );
  }

  const profile = await getBusinessProfile(ctx.actor, current.org.id).catch(() => null);
  const isVenue = Boolean(profile?.profile?.categories.includes('venue'));
  if (!isVenue) {
    return (
      <AppFrame userId={ctx.actor.userId} active="business" title={t('spacesTitle')}>
        <EmptyState
          icon={<Building2 className="size-8" aria-hidden />}
          title={t('notVenueTitle')}
          body={t('notVenueBody')}
          action={
            <Link href="/business/profile" className="text-brand-strong font-semibold underline-offset-4 hover:underline">
              {t('goToProfile')}
            </Link>
          }
        />
      </AppFrame>
    );
  }

  const canManage = current.role === 'OWNER' || current.role === 'ADMIN';
  const [spaces] = await Promise.all([listSpaces(ctx.actor, current.org.id)]);
  const storage = privateStorage();
  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  const toDate = new Date(now.getTime() + 90 * 86_400_000);
  const to = toDate.toISOString().slice(0, 10);
  const rows: SpaceRow[] = await Promise.all(
    spaces.map(async (space) => {
      const [photos, blocks] = await Promise.all([
        Promise.all((space.photoKeys ?? []).map(async (key) => ({ key, url: await storage.getSignedUrl(key, 3600) }))),
        canManage
          ? listSpaceAvailability(ctx.actor, { orgId: current.org.id, spaceId: space.id, from, to })
          : Promise.resolve([]),
      ]);
      return {
        id: space.id,
        name: space.name,
        indoor: space.indoor,
        capacitySeated: space.capacitySeated,
        capacityTheatre: space.capacityTheatre,
        capacityStanding: space.capacityStanding,
        sizeSqm: space.sizeSqm,
        amenities: space.amenities,
        rules: space.rules,
        slotPrices: (space.slotPrices ?? {}) as Record<string, string>,
        setupMinutes: space.setupMinutes,
        teardownMinutes: space.teardownMinutes,
        securityDepositMinor: space.securityDepositMinor?.toString() ?? null,
        active: space.active,
        photos,
        blocks: blocks.map((block) => ({
          id: block.id,
          date: block.date.toISOString(),
          reason: block.reason,
          slot: block.slot,
          bookingId: block.bookingId,
        })),
      };
    }),
  );

  return (
    <AppFrame userId={ctx.actor.userId} active="business" title={t('spacesTitle')}>
      <div className="flex flex-col gap-2 py-4">
        <h2 className="font-display text-xl font-bold">{t('spacesTitle')}</h2>
        <p className="text-muted text-sm">{t('spacesBody')}</p>
        {mine.length > 1 && (
          <nav aria-label={tb('orgSwitch')} className="flex flex-wrap gap-2">
            {mine.map((row) => (
              <Link
                key={row.org.id}
                href={`/business/spaces?org=${row.org.id}`}
                aria-current={row.org.id === current.org.id ? 'page' : undefined}
                className={row.org.id === current.org.id ? 'font-medium underline' : 'text-muted underline'}
              >
                {row.org.name}
              </Link>
            ))}
          </nav>
        )}
        {!canManage && <Banner tone="warning">{tb('forbiddenBody')}</Banner>}
        <SpacesManager
          orgId={current.org.id}
          currency={profile?.profile?.currency ?? 'NGN'}
          instantBook={profile?.profile?.instantBook ?? false}
          holdHours={profile?.profile?.holdHours ?? 72}
          spaces={rows.filter((row) => row.active || canManage)}
          canManage={canManage}
        />
      </div>
    </AppFrame>
  );
}
