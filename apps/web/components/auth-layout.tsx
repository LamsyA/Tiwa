import { ThemeToggle } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import type * as React from 'react';
// Free-licence photos (same set as public/marketplace and the home hero).
import heroImg from '../public/landing/auth.jpg';
import hallImg from '../public/marketplace/venue-1.jpg';
import guestsImg from '../public/landing/hero.jpg';

const SLIDES = [heroImg, hallImg, guestsImg];

/**
 * Sign-in / sign-up frame: full-height photo with a short message on the
 * left (lg+), the form on the right. Phones get a slim photo header so the
 * form stays above the fold. Server component; the form inside is the client.
 */
export async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('authLayout');
  const app = await getTranslations('app');
  const landing = await getTranslations('landing');

  return (
    <div className="bg-bg text-text grid h-dvh overflow-hidden lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        {/* Only the first photo is priority; the others load lazily after it. */}
        <div className="absolute inset-0">
          {SLIDES.map((src, index) => (
            <Image
              key={src.src}
              src={src}
              alt=""
              priority={index === 0}
              placeholder="blur"
              sizes="55vw"
              className="tiwa-auth-slide absolute inset-0 size-full object-cover"
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-10">
          <Link href="/" className="font-display text-2xl font-bold tracking-tight text-white">
            {app('name')}
          </Link>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-8 text-white xl:p-12">
          <p className="font-display max-w-lg text-3xl leading-[1.05] font-bold tracking-[-0.02em] text-balance xl:text-4xl 2xl:text-5xl">
            {t('quote')}
          </p>
          <p className="mt-4 max-w-md text-lg text-white/75">{t('body')}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {(['plan', 'book', 'chat', 'moments'] as const).map((key) => (
              <span
                key={key}
                className="rounded-full bg-white/12 px-3.5 py-1.5 text-sm font-medium ring-1 ring-white/20 backdrop-blur-md"
              >
                {t(`chips.${key}`)}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <div className="relative flex h-dvh min-h-0 flex-col">
        <div className="relative h-[72px] shrink-0 overflow-hidden sm:h-28 lg:hidden">
          <Image src={heroImg} alt="" priority placeholder="blur" sizes="100vw" className="size-full object-cover" />
          <div className="from-bg absolute inset-0 bg-gradient-to-t via-black/20 to-black/30" />
          <Link
            href="/"
            className="font-display absolute top-4 left-5 text-xl font-bold tracking-tight text-white drop-shadow"
          >
            {app('name')}
          </Link>
        </div>
        <div className="absolute top-3 right-4 z-10 sm:top-6 sm:right-6">
          <ThemeToggle
            labels={{ light: landing('theme.light'), dark: landing('theme.dark') }}
            className="border-border/70 bg-bg/70 border backdrop-blur-md"
          />
        </div>
        <main className="flex min-h-0 flex-1 justify-center overflow-y-auto px-5 py-3 sm:px-8 sm:py-4 lg:py-6">
          <div className="my-auto w-full max-w-[420px]">{children}</div>
        </main>
        <p className="text-muted shrink-0 px-5 pb-3 text-center text-[11px] leading-snug sm:pb-4">{t('legal')}</p>
      </div>
    </div>
  );
}
