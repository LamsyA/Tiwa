import { ThemeToggle } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type * as React from 'react';

/**
 * Onboarding frame: wordmark, a quiet step indicator and a centred column
 * over a soft brand glow. Server component; forms inside are the clients.
 */
export async function OnboardingFrame({
  step,
  total = 2,
  eyebrow,
  title,
  body,
  wide = false,
  children,
}: {
  step: number;
  total?: number;
  eyebrow?: string;
  title: string;
  body?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const app = await getTranslations('app');
  const t = await getTranslations('onboarding');
  const landing = await getTranslations('landing');
  return (
    <div className="bg-bg text-text relative min-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background: 'radial-gradient(closest-side, color-mix(in oklab, var(--brand) 22%, transparent), transparent)',
        }}
      />
      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="font-display text-xl font-bold tracking-tight">
          {app('name')}
        </Link>
        <div className="flex items-center gap-4">
          <p className="text-muted hidden text-sm sm:block">{t('stepOf', { step, total })}</p>
          <div aria-hidden className="hidden gap-1.5 sm:flex">
            {Array.from({ length: total }, (_, index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full transition-all ${index < step ? 'bg-brand w-8' : 'bg-border w-4'}`}
              />
            ))}
          </div>
          <ThemeToggle
            labels={{ light: landing('theme.light'), dark: landing('theme.dark') }}
            className="border-border/70 bg-bg/70 border backdrop-blur-md"
          />
        </div>
      </header>
      <main
        className={`tiwa-fade-up relative mx-auto px-5 pt-6 pb-16 sm:pt-12 ${wide ? 'max-w-5xl' : 'max-w-[460px]'}`}
      >
        <div className={wide ? 'mx-auto max-w-2xl text-center' : ''}>
          {eyebrow && <p className="text-brand-strong text-sm font-semibold tracking-wide uppercase">{eyebrow}</p>}
          <h1 className="font-display mt-2 text-3xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-4xl">
            {title}
          </h1>
          {body && <p className="text-muted mt-3 text-base text-pretty sm:text-lg">{body}</p>}
        </div>
        <div className="mt-8 sm:mt-10">{children}</div>
      </main>
    </div>
  );
}
