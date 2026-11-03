import type { Metadata } from 'next';
import { VENDOR_CATEGORIES } from '@tiwa/config';
import { authorize, listMyEvents, listVendorReviews, loadEventAccess, resolvePublicOrgId } from '@tiwa/core';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { InstantBookDialog } from '@/components/marketplace/instant-book-dialog.js';
import { QuoteRequestDialog, type QuoteEventOption } from '@/components/marketplace/quote-request-dialog.js';
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
  // Quote requests (D-X39): any event the viewer plans (host, co-host, planner).
  // The server re-checks event.edit on send.
  const viewer = await getCtx();
  let quoteEvents: QuoteEventOption[] = [];
  if (viewer.actor) {
    const userId = viewer.actor.userId;
    const [upcoming, drafts] = await Promise.all([
      listMyEvents(userId, 'upcoming').catch(() => []),
      listMyEvents(userId, 'drafts').catch(() => []),
    ]);
    quoteEvents = [...upcoming, ...drafts]
      .filter((row) => ['HOST', 'CO_HOST', 'PLANNER', 'PLANNER_STAFF'].includes(row.role))
      .map((row) => ({
        id: row.id,
        name: row.name,
        when: row.startsAt
          ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: row.timezone }).format(
              row.startsAt,
            )
          : null,
        currency: profile.profile.currency,
        date: row.startsAt ? new Intl.DateTimeFormat('en-CA', { timeZone: row.timezone }).format(row.startsAt) : null,
      }));
  }
  const offered = profile.profile.categories.filter((key) => key in VENDOR_CATEGORIES);
  const quoteCategories = (offered.length > 0 ? offered : Object.keys(VENDOR_CATEGORIES)).map((key) => ({
    key,
    label: VENDOR_CATEGORIES[key as keyof typeof VENDOR_CATEGORIES],
  }));
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
        eventDate={quoteEvents.find((row) => row.id === eventId)?.date ?? null}
        eventName={quoteEvents.find((row) => row.id === eventId)?.name ?? null}
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
        requestQuote={
          <QuoteRequestDialog
            vendorOrgId={profile.org.id}
            vendorName={profile.org.name}
            events={quoteEvents}
            categories={quoteCategories}
            defaultEventId={eventId && quoteEvents.some((row) => row.id === eventId) ? eventId : undefined}
            signInHref={viewer.actor ? undefined : `/login?next=${encodeURIComponent(`/vendors/${slug}`)}`}
            availability={availabilityRows}
            spaces={profile.spaces.length}
          />
        }
        siteVisit={showVisit && eventId ? <SiteVisitDialog eventId={eventId} vendorOrgId={profile.org.id} /> : null}
      />
    </main>
  );
}
