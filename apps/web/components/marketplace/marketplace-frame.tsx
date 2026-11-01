import { ThemeToggle, buttonClasses, cn } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import type { StaticImageData } from 'next/image';
import Link from 'next/link';
import type * as React from 'react';
// Sample cover photos (Pexels, free licence, self-hosted) until businesses upload their own.
import cateringImg from '../../public/landing/catering.jpg';
import djImg from '../../public/landing/dj.jpg';
import heroImg from '../../public/landing/hero.jpg';
import photographyImg from '../../public/landing/photography.jpg';
import venueImg from '../../public/landing/venue.jpg';

export type MarketplaceSection = 'vendors' | 'planners' | 'venues';

const COVERS: Record<string, StaticImageData> = {
  venue: venueImg,
  catering: cateringImg,
  small_chops: cateringImg,
  drinks: cateringImg,
  cake: cateringImg,
  photography: photographyImg,
  videography: photographyImg,
  dj: djImg,
  live_band: djImg,
  mc: djImg,
  sound_lighting: djImg,
  av_production: djImg,
};

/** A cover for a business card from its first matching category; a celebration photo otherwise. */
export function coverFor(categories: readonly string[]): StaticImageData {
  for (const key of categories) if (COVERS[key]) return COVERS[key];
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
              href="/home"
              className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'rounded-full' })}
            >
              {t('myEvents')}
            </Link>
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
