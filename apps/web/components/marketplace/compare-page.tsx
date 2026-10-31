import { listShortlist, loadEventAccess } from '@tiwa/core';
import { VENDOR_CATEGORIES } from '@tiwa/config';
import { Card } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';

/** Side-by-side compare of up to 4 shortlisted businesses (MKT-05, P6-T06). */
export async function ComparePageBody({
  kind,
  base,
  searchParams,
}: {
  kind: 'VENDOR' | 'PLANNER';
  base: '/vendors' | '/planners';
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.eventId;
  const eventId = Array.isArray(raw) ? raw[0] : raw;
  if (!eventId) notFound();
  const ctx = await requirePageUser(`${base}/compare?eventId=${eventId}`);
  const t = await getTranslations('marketplace');
  const access = await loadEventAccess(ctx.actor.userId, eventId);
  if (!access) notFound();
  const picks = (await listShortlist(ctx.actor, { eventId })).slice(0, 4);
  const labels = (keys: string[]) => keys.map((key) => VENDOR_CATEGORIES[key as keyof typeof VENDOR_CATEGORIES] ?? key).join(', ');

  return (
    <AppFrame userId={ctx.actor.userId} active="more" title={t('compareTitle')}>
      <div className="flex flex-col gap-4 py-4">
        <Link href={`${base}?eventId=${eventId}`} className="text-sm underline">
          ← {t(kind === 'VENDOR' ? 'searchVendors' : 'searchPlanners')}
        </Link>
        {picks.length === 0 ? (
          <p className="text-muted text-sm">{t('compareEmpty')}</p>
        ) : (
          <>
            {picks.length >= 4 && <p className="text-muted text-sm">{t('compareLimit')}</p>}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {picks.map((pick) => (
                <Card key={pick.orgId}>
                  <div className="flex flex-col gap-2 p-4 text-sm">
                    <Link href={`${base}/${pick.org.slug}`} className="font-medium underline">
                      {pick.org.name}
                    </Link>
                    <p className="text-muted">{pick.org.profile?.city}</p>
                    <p>{labels(pick.org.profile?.categories ?? [])}</p>
                    <p>
                      {pick.org.profile?.startingPriceMinor?.toString() ?? '—'} {pick.org.profile?.currency ?? ''}
                    </p>
                    <p>
                      {pick.org.profile?.ratingAvg !== null && pick.org.profile?.ratingAvg !== undefined
                        ? `★ ${pick.org.profile.ratingAvg.toFixed(1)} (${pick.org.profile.ratingCount})`
                        : t('newOnTiwa')}
                    </p>
                    <p>{pick.org.profile?.published ? '' : t('pending')}</p>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </AppFrame>
  );
}
