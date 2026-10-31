import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicProfileView } from '@/components/marketplace/public-profile.js';
import { loadPublicProfile } from '@/components/marketplace/loader.js';

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

export default async function VendorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, photos, blockedDays } = await loadPublicProfile(slug, 'VENDOR');
  return (
    <main>
      <header className="border-border border-b">
        <div className="mx-auto w-full max-w-5xl px-4 py-3">
          <Link href="/" className="font-display text-lg font-bold">
            Tiwa
          </Link>
        </div>
      </header>
      <PublicProfileView profile={profile} photos={photos} blockedDays={blockedDays} />
    </main>
  );
}
