import { ThemeToggle, buttonClasses, cn } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import type { StaticImageData } from 'next/image';
import Link from 'next/link';
import type * as React from 'react';
import { auth } from '@/lib/auth.js';
import { AccountMenu } from '../account-menu.js';
import { loadAccount } from '../app-frame.js';
// Sample cover photos until businesses upload their own: Pexels (free licence, commercial use),
// self-hosted. IDs: venue 12688995 30311728 36028895 · catering 28736731 13915043 17952748 ·
// small chops 37648029 29037265 · decor 37190288 11450796 · makeup 34049570 33951059 ·
// sound 29261518 12787862 · cake 30445121 31243081 · security 34585117 13602781 ·
// dj 9719248 13137879 · photo 40230686 30517381 · video 30820659 · band 33565506 · default 36808366 ·
// drinks 18817906 29093620 · transport 37828108 37828107 36377051 1467591 · gifts 3873488 17575750 ·
// planners 14581440 6170652 4101413 38635223.
import venue1Img from '../../public/marketplace/venue-1.jpg';
import venue2Img from '../../public/marketplace/venue-2.jpg';
import venue3Img from '../../public/marketplace/venue-3.jpg';
import catering1Img from '../../public/marketplace/catering-1.jpg';
import catering2Img from '../../public/marketplace/catering-2.jpg';
import catering3Img from '../../public/marketplace/catering-3.jpg';
import chops1Img from '../../public/marketplace/chops-1.jpg';
import chops2Img from '../../public/marketplace/chops-2.jpg';
import decor1Img from '../../public/marketplace/decor-1.jpg';
import decor2Img from '../../public/marketplace/decor-2.jpg';
import makeup1Img from '../../public/marketplace/makeup-1.jpg';
import makeup2Img from '../../public/marketplace/makeup-2.jpg';
import sound1Img from '../../public/marketplace/sound-1.jpg';
import sound2Img from '../../public/marketplace/sound-2.jpg';
import cake1Img from '../../public/marketplace/cake-1.jpg';
import cake2Img from '../../public/marketplace/cake-2.jpg';
import security1Img from '../../public/marketplace/security-1.jpg';
import security2Img from '../../public/marketplace/security-2.jpg';
import dj1Img from '../../public/marketplace/dj-1.jpg';
import dj2Img from '../../public/marketplace/dj-2.jpg';
import photo1Img from '../../public/marketplace/photo-1.jpg';
import photo2Img from '../../public/marketplace/photo-2.jpg';
import video1Img from '../../public/marketplace/video-1.jpg';
import band1Img from '../../public/marketplace/band-1.jpg';
import drinks1Img from '../../public/marketplace/drinks-1.jpg';
import drinks2Img from '../../public/marketplace/drinks-2.jpg';
import transport1Img from '../../public/marketplace/transport-1.jpg';
import transport2Img from '../../public/marketplace/transport-2.jpg';
import transport3Img from '../../public/marketplace/transport-3.jpg';
import transport4Img from '../../public/marketplace/transport-4.jpg';
import gifts1Img from '../../public/marketplace/gifts-1.jpg';
import gifts2Img from '../../public/marketplace/gifts-2.jpg';
import planner1Img from '../../public/marketplace/planner-1.jpg';
import planner2Img from '../../public/marketplace/planner-2.jpg';
import planner3Img from '../../public/marketplace/planner-3.jpg';
import planner4Img from '../../public/marketplace/planner-4.jpg';
import heroImg from '../../public/landing/hero.jpg';
import venueLandingImg from '../../public/landing/venue.jpg';

export type MarketplaceSection = 'vendors' | 'planners' | 'venues';

const VENUES = [venue1Img, venue2Img, venue3Img];
const FOOD = [catering1Img, catering2Img, catering3Img];
const MUSIC = [dj1Img, dj2Img, band1Img];
const COVERS: Record<string, StaticImageData[]> = {
  venue: VENUES,
  catering: FOOD,
  drinks: [drinks1Img, drinks2Img],
  transport: [transport1Img, transport3Img, transport2Img, transport4Img],
  souvenirs: [gifts1Img, gifts2Img],
  printing: [gifts2Img, gifts1Img],
  small_chops: [chops1Img, chops2Img],
  cake: [cake1Img, cake2Img],
  decor: [decor1Img, decor2Img],
  rentals: [decor2Img, decor1Img],
  makeup: [makeup1Img, makeup2Img],
  fashion: [makeup2Img, makeup1Img],
  photography: [photo1Img, photo2Img],
  videography: [video1Img, photo2Img],
  dj: MUSIC,
  live_band: [band1Img, dj2Img],
  mc: [band1Img, dj1Img],
  sound_lighting: [sound1Img, sound2Img],
  av_production: [sound2Img, sound1Img],
  security: [security1Img, security2Img],
  ushers: [security2Img, security1Img],
};

/** A string seed hashes (stable per business); a number seed rotates (position in a result list, so neighbours differ). */
function pick<T>(list: T[], seed: string | number): T {
  if (typeof seed === 'number') return list[seed % list.length]!;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return list[Math.abs(hash) % list.length]!;
}

/** Planner cards: planning and styled-event photos, stable per planner. */
export function plannerCover(seed: string | number): StaticImageData {
  return pick([planner1Img, planner2Img, planner3Img, planner4Img, decor1Img], seed);
}

/**
 * Venue photos for a venue that hasn't uploaded its own yet (D-X43): the
 * four event-venue pictures, rotated per venue so neighbours differ.
 */
export function venueGallery(seed: string | number): StaticImageData[] {
  const all = [venue1Img, venue2Img, venue3Img, venueLandingImg];
  const start = all.indexOf(pick(all, seed));
  return [...all.slice(start), ...all.slice(0, start)];
}

/** A cover for a business card: a photo from its first category that has one; a celebration otherwise. */
export function coverFor(categories: readonly string[], seed: string | number = ''): StaticImageData {
  for (const key of categories) {
    const list = COVERS[key];
    if (list) return pick(list, seed === '' ? key : seed);
  }
  return heroImg;
}

/**
 * Marketplace frame (MKT-03): its own top bar instead of the signed-in app
 * sidebar, because browsing businesses is a public-facing, full-width
 * experience. Links back to the user's events for the way home.
 */
export async function MarketplaceFrame({
  active,
  title,
  subtitle,
  children,
}: {
  active: MarketplaceSection;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations('marketplaceFrame');
  const app = await getTranslations('app');
  const landing = await getTranslations('landing');
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const account = session?.user ? await loadAccount(session.user.id as string) : null;
  const sections: { key: MarketplaceSection; href: string }[] = [
    { key: 'vendors', href: '/vendors' },
    { key: 'venues', href: '/venues' },
    { key: 'planners', href: '/planners' },
  ];

  return (
    <div className="bg-bg text-text min-h-dvh">
      <header className="bg-bg/80 border-border/70 sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="font-display text-xl font-bold tracking-tight">
            {app('name')}
          </Link>
          <nav aria-label={t('nav')} className="ml-2 hidden items-center gap-1 sm:flex">
            {sections.map((section) => (
              <Link
                key={section.key}
                href={section.href}
                aria-current={active === section.key ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  active === section.key ? 'bg-surface-2 text-text' : 'text-muted hover:text-text',
                )}
              >
                {t(section.key)}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle labels={{ light: landing('theme.light'), dark: landing('theme.dark') }} />
            <Link
              href={account ? '/home' : '/login'}
              className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'rounded-full' })}
            >
              {account ? t('myEvents') : t('signIn')}
            </Link>
            {account && <AccountMenu account={account} compact />}
          </div>
        </div>
        <nav aria-label={t('nav')} className="scrollbar-none flex gap-1 overflow-x-auto px-4 pb-2.5 sm:hidden">
          {sections.map((section) => (
            <Link
              key={section.key}
              href={section.href}
              aria-current={active === section.key ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium',
                active === section.key ? 'bg-surface-2 text-text' : 'text-muted',
              )}
            >
              {t(section.key)}
            </Link>
          ))}
        </nav>
      </header>

      <section className="border-border/70 border-b">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <p className="text-brand-strong text-xs font-semibold tracking-[0.2em] uppercase">{t('eyebrow')}</p>
          <h1 className="font-display mt-3 max-w-3xl text-4xl font-bold tracking-[-0.03em] text-balance sm:text-5xl">
            {title}
          </h1>
          {subtitle && <p className="text-muted mt-3 max-w-2xl text-lg">{subtitle}</p>}
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">{children}</main>
    </div>
  );
}
