import { ThemeToggle } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import type * as React from 'react';
// Pexels #36808366 (free licence), shared with the home hero.
import heroImg from '../public/landing/hero.jpg';

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
    <div className="bg-bg text-text grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        <Image src={heroImg} alt="" priority placeholder="blur" sizes="55vw" className="size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-10">
          <Link href="/" className="font-display text-2xl font-bold tracking-tight text-white">
            {app('name')}
          </Link>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-10 text-white xl:p-14">
          <p className="font-display max-w-lg text-4xl leading-[1.05] font-bold tracking-[-0.02em] text-balance xl:text-5xl">
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

      <div className="relative flex min-h-dvh flex-col">
        <div className="relative h-36 overflow-hidden lg:hidden">
          <Image src={heroImg} alt="" priority placeholder="blur" sizes="100vw" className="size-full object-cover" />
          <div className="from-bg absolute inset-0 bg-gradient-to-t via-black/20 to-black/30" />
          <Link
            href="/"
            className="font-display absolute top-5 left-5 text-xl font-bold tracking-tight text-white drop-shadow"
          >
            {app('name')}
          </Link>
        </div>
        <div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
          <ThemeToggle
            labels={{ light: landing('theme.light'), dark: landing('theme.dark') }}
            className="border-border/70 bg-bg/70 border backdrop-blur-md"
          />
        </div>
        <main className="flex flex-1 items-start justify-center px-5 pb-10 sm:px-8 lg:items-center lg:py-16">
          <div className="w-full max-w-[420px]">{children}</div>
        </main>
        <p className="text-muted px-5 pb-6 text-center text-xs">{t('legal')}</p>
      </div>
    </div>
  );
}
