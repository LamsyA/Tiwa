import type { Metadata } from 'next';
import { authorize, listVendorReviews, loadEventAccess, resolvePublicOrgId } from '@tiwa/core';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { InstantBookDialog } from '@/components/marketplace/instant-book-dialog.js';
import { SiteVisitDialog } from '@/components/marketplace/site-visit-dialog.js';
import { PublicProfileView } from '@/components/marketplace/public-profile.js';
import { loadPublicProfile } from '@/components/marketplace/loader.js';
import { getCtx } from '@/lib/ctx.js';

/** Public vendor profile (MKT-07, P6-T04). Profile data is data-cached with
 * tag `vendor:{orgId}` (D-X18); route HTML stays dynamic because the root
 * layout reads the theme cookie. */
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return loadPublicProfile(slug, 'VENDOR')
    .then(({ profile }) => ({
      title: `${profile.org.name} · ${profile.profile.city}`,
      description: profile.profile.bio?.slice(0, 160) ?? `${profile.org.name} on Tiwa`,
    }))
    .catch(() => ({ title: 'Vendor on Tiwa' }));
}

export default async function VendorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { slug } = await params;
  const { eventId } = await searchParams;
  const { profile, photos, availabilityRows } = await loadPublicProfile(slug, 'VENDOR');
  const t = await getTranslations('marketplace');
  // Instant booking (QTE-06, P7-T10) and site visits (P7-T11): only when the viewer can edit the event.
  let canBook = false;
  let canEdit = false;
  if (eventId) {
    const ctx = await getCtx();
    if (ctx.actor) {
      const access = await loadEventAccess(ctx.actor.userId, eventId).catch(() => null);
      if (access) {
        try {
          authorize(ctx.actor, 'event.edit', { eventId, access });
          canEdit = true;
          canBook = profile.profile.instantBook;
        } catch {
          canBook = false;
        }
      }
    }
  }
  const isVenue = profile.profile.categories.includes('venue');
  const showVisit = canEdit && isVenue;
  const orgId = await resolvePublicOrgId(slug, 'VENDOR').catch(() => null);
  const reviews = orgId ? await listVendorReviews(orgId, 10) : [];
  const ctx = await getCtx();
  return (
    <main>
      <header className="border-border border-b">
        <div className="mx-auto w-full max-w-5xl px-4 py-3">
          <Link href="/" className="font-display text-lg font-bold">
            {t('brandName')}
          </Link>
        </div>
      </header>
      <PublicProfileView
        profile={profile}
        photos={photos}
        availabilityRows={availabilityRows}
        reviews={reviews.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
        signedIn={ctx.actor !== null}
        instantBook={
          canBook && eventId ? (
            <InstantBookDialog
              eventId={eventId}
              vendorOrgId={profile.org.id}
              spaces={profile.spaces.map((space) => ({
                id: space.id,
                name: space.name,
                slotPrices: space.slotPrices as Record<string, string>,
              }))}
            />
          ) : null
        }
        siteVisit={showVisit && eventId ? <SiteVisitDialog eventId={eventId} vendorOrgId={profile.org.id} /> : null}
      />
    </main>
  );
}
