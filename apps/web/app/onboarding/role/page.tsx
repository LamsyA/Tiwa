import { safeNextPath } from '@tiwa/core';
import { ArrowRight, Briefcase, PartyPopper, Store } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { OnboardingFrame } from '@/components/onboarding-frame.js';
// Pexels photos (free licence), shared with the landing page and marketplace.
import hostImg from '../../../public/landing/hero.jpg';
import vendorImg from '../../../public/marketplace/catering-1.jpg';
import plannerImg from '../../../public/marketplace/planner-1.jpg';

const ROLES = [
  { key: 'Host', icon: PartyPopper, href: '/onboarding/profile', img: hostImg, tone: 'var(--brand)' },
  {
    key: 'Planner',
    icon: Briefcase,
    href: '/onboarding/business?role=planner',
    img: plannerImg,
    tone: 'var(--accent)',
  },
  { key: 'Vendor', icon: Store, href: '/onboarding/business?role=vendor', img: vendorImg, tone: 'var(--warning)' },
] as const;

export default async function RolePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const keep = safeNextPath(next, '');
  const t = await getTranslations('onboarding');
  return (
    <OnboardingFrame step={1} wide eyebrow={t('roleEyebrow')} title={t('roleTitle')} body={t('roleBody')}>
      <ul className="grid gap-4 sm:grid-cols-3">
        {ROLES.map((role, index) => {
          const href = keep
            ? `${role.href}${role.href.includes('?') ? '&' : '?'}next=${encodeURIComponent(keep)}`
            : role.href;
          return (
            <li key={role.key} className="tiwa-fade-up" style={{ animationDelay: `${index * 70}ms` }}>
              <Link
                href={href}
                className="group border-border/70 bg-surface focus-visible:outline-focus relative flex h-full flex-col overflow-hidden rounded-3xl border shadow-[var(--shadow-1)] transition duration-300 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-2)] focus-visible:outline-2"
              >
                <div className="relative aspect-[16/10] overflow-hidden sm:aspect-[4/3]">
                  <Image
                    src={role.img}
                    alt=""
                    placeholder="blur"
                    sizes="(min-width: 640px) 33vw, 100vw"
                    className="size-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
                  <span
                    className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white backdrop-blur-md"
                    style={{ background: `color-mix(in oklab, ${role.tone} 70%, black 10%)` }}
                  >
                    <role.icon aria-hidden className="size-3.5" />
                    {t(`role${role.key}Tag`)}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-5">
                  <span className="font-display text-lg font-bold tracking-tight">{t(`role${role.key}Title`)}</span>
                  <span className="text-muted text-sm leading-relaxed">{t(`role${role.key}Body`)}</span>
                  <span
                    className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-semibold"
                    style={{ color: role.tone }}
                  >
                    {t('roleCta')}
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-muted mt-8 text-center text-sm">{t('roleLater')}</p>
    </OnboardingFrame>
  );
}
