import type { Metadata } from 'next';
import { listMyEvents, listVendorReviews, resolvePublicOrgId } from '@tiwa/core';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { loadPublicProfile } from '@/components/marketplace/loader.js';
import { PublicProfileView } from '@/components/marketplace/public-profile.js';
import { ProposalRequestDialog } from '@/components/marketplace/proposal-request-dialog.js';
import type { QuoteEventOption } from '@/components/marketplace/quote-request-dialog.js';
import { getCtx } from '@/lib/ctx.js';

/** Public planner profile (MKT-07, P6-T04). Profile data is data-cached with
 * tag `vendor:{orgId}` (D-X18); route HTML stays dynamic because the root
 * layout reads the theme cookie. */
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return loadPublicProfile(slug, 'PLANNER')
    .then(({ profile }) => ({
      title: `${profile.org.name} · ${profile.profile.city}`,
      description: profile.profile.bio?.slice(0, 160) ?? `${profile.org.name} on Tiwa`,
    }))
    .catch(() => ({ title: 'Planner on Tiwa' }));
}

export default async function PlannerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { slug } = await params;
  const { eventId } = await searchParams;
  const { profile, photos, availabilityRows } = await loadPublicProfile(slug, 'PLANNER');
  const t = await getTranslations('marketplace');
  const orgId = await resolvePublicOrgId(slug, 'PLANNER').catch(() => null);
  const reviews = orgId ? await listVendorReviews(orgId, 10) : [];
  const ctx = await getCtx();
  // Proposal requests (D-X64): any event the viewer runs as host or co-host.
  // The server re-checks event.edit on send.
  let proposalEvents: QuoteEventOption[] = [];
  if (ctx.actor) {
    const userId = ctx.actor.userId;
    const [upcoming, drafts] = await Promise.all([
      listMyEvents(userId, 'upcoming').catch(() => []),
      listMyEvents(userId, 'drafts').catch(() => []),
    ]);
    proposalEvents = [...upcoming, ...drafts]
      .filter((row) => ['HOST', 'CO_HOST'].includes(row.role))
      .map((row) => ({
        id: row.id,
        name: row.name,
        when: row.startsAt
          ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: row.timezone }).format(
              row.startsAt,
            )
          : null,
        currency: profile.profile.currency,
      }));
  }
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
        requestQuote={
          <ProposalRequestDialog
            plannerOrgId={profile.org.id}
            plannerName={profile.org.name}
            events={proposalEvents}
            defaultEventId={eventId && proposalEvents.some((row) => row.id === eventId) ? eventId : undefined}
            signInHref={ctx.actor ? undefined : `/login?next=${encodeURIComponent(`/planners/${slug}`)}`}
          />
        }
      />
    </main>
  );
}
