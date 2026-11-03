import { VENDOR_CATEGORIES, currencyForCountry, eventTypeCards } from '@tiwa/config';
import { MoneyText, ThemeToggle, buttonClasses, cn } from '@tiwa/ui';
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  CheckCheck,
  ClipboardList,
  Paperclip,
  SendHorizontal,
  ShieldCheck,
  Star,
  Store,
  Ticket,
  Wallet,
  Zap,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
// Marketplace sample photos: Pexels (free licence, commercial use allowed), self-hosted.
// venue #12688995, catering #28736731, photography #40230686, dj #9719248.
import cateringImg from '../public/landing/catering.jpg';
import djImg from '../public/landing/dj.jpg';
import photographyImg from '../public/landing/photography.jpg';
import venueImg from '../public/landing/venue.jpg';
// Hero cover: Pexels #36808366 (free licence).
import heroImg from '../public/landing/hero.jpg';
import type * as React from 'react';

export const dynamic = 'force-static';

type T = Awaited<ReturnType<typeof getTranslations<'landing'>>>;

/**
 * Public home (Frontend.md §6 "/ Home", static). No navbar: a floating
 * corner holds the theme switch and sign-in. 3D is CSS perspective (no
 * WebGL); photos are self-hosted Pexels images through next/image (hero cover
 * is priority-loaded). The only JavaScript is the theme switch. Event types and
 * vendor categories come from config; prices use the configured currency.
 */
export default async function Home() {
  const t = await getTranslations('landing');
  const app = await getTranslations('app');
  const types = eventTypeCards().map((type) => type.label);
  const half = Math.ceil(types.length / 2);
  const rows = [types.slice(0, half), types.slice(half)];

  return (
    <div className="bg-bg text-text relative min-h-dvh overflow-x-clip">
      {/* Floating corner: no navbar */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-1.5 sm:top-6 sm:right-6">
        <ThemeToggle
          labels={{ light: t('theme.light'), dark: t('theme.dark') }}
          className="border-border/70 bg-bg/60 border backdrop-blur-md"
        />
        <Link
          href="/login"
          className={buttonClasses({
            variant: 'ghost',
            size: 'sm',
            className: 'border-border/70 bg-bg/60 rounded-full border backdrop-blur-md',
          })}
        >
          {t('top.login')}
        </Link>
      </div>

      <main>
        <Hero t={t} name={app('name')} />

        {/* Occasions marquee */}
        <section aria-labelledby="types" className="py-14 sm:py-20">
          <h2 id="types" className="text-muted mb-8 text-center text-xs font-semibold tracking-[0.25em] uppercase">
            {t('types.title')}
          </h2>
          <div className="tiwa-marquee-mask flex flex-col gap-4 overflow-hidden">
            {rows.map((row, index) => (
              <div key={index} className="flex w-max">
                <ul className={cn('flex shrink-0 gap-4 pr-4', index === 0 ? 'tiwa-marquee' : 'tiwa-marquee-reverse')}>
                  {[...row, ...row].map((label, i) => (
                    <li
                      key={`${label}-${i}`}
                      aria-hidden={i >= row.length}
                      className="font-display text-text/80 flex items-center gap-4 text-2xl font-bold whitespace-nowrap sm:text-4xl"
                    >
                      {label}
                      <span className="from-brand to-accent size-2 rounded-full bg-gradient-to-r" aria-hidden />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <Marketplace t={t} />
        <Chat t={t} />
        <Features t={t} />
        <FinalCta t={t} />
      </main>

      <footer className="border-border/60 border-t">
        <div className="text-muted mx-auto flex max-w-6xl flex-col gap-3 px-5 py-10 text-sm sm:flex-row sm:items-center sm:px-6">
          <span className="font-display text-text text-lg font-bold">{app('name')}</span>
          <span className="sm:mr-auto">{t('footer.tagline')}</span>
          <span>
            © {new Date().getFullYear()} {app('name')}. {t('footer.rights')}
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ───────────── Hero: copy beside a 3D event card ───────────── */

function Hero({ t, name }: { t: T; name: string }) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="tiwa-grid-bg absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(45% 50% at 78% 40%, color-mix(in oklab, var(--brand) 26%, transparent), transparent 70%),' +
            'radial-gradient(35% 40% at 95% 85%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 70%),' +
            'radial-gradient(35% 40% at 5% 10%, color-mix(in oklab, var(--brand-strong) 12%, transparent), transparent 70%)',
        }}
      />
      <div className="mx-auto grid min-h-[100svh] max-w-7xl items-center gap-14 px-5 pt-24 pb-20 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-8 lg:pt-20">
        <div className="flex flex-col items-start">
          <p className="font-display text-text mb-8 text-xl font-bold tracking-tight">{name}</p>
          <span className="border-border/70 bg-bg/60 text-muted mb-7 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur-md sm:text-sm">
            <span className="relative flex size-2">
              <span className="bg-brand absolute inline-flex size-full animate-ping rounded-full opacity-60" />
              <span className="bg-brand relative inline-flex size-2 rounded-full" />
            </span>
            {t('hero.badge')}
          </span>
          <h1 className="font-display text-[2.9rem] leading-[0.98] font-bold tracking-[-0.04em] text-balance sm:text-7xl xl:text-[5.75rem]">
            {t('hero.titleA')}
            <br />
            <span className="from-brand via-brand to-accent bg-gradient-to-r bg-clip-text text-transparent">
              {t('hero.titleB')}
            </span>
          </h1>
          <p className="text-muted mt-7 max-w-xl text-lg leading-relaxed text-pretty sm:text-xl">{t('hero.body')}</p>
          <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/signup"
              className={buttonClasses({
                size: 'lg',
                className:
                  'group rounded-full px-7 shadow-[0_10px_40px_-10px_var(--brand)] transition-shadow hover:shadow-[0_14px_50px_-8px_var(--brand)]',
              })}
            >
              {t('hero.primary')}
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link
              href="/vendors"
              className={buttonClasses({
                variant: 'secondary',
                size: 'lg',
                className: 'bg-bg/60 rounded-full px-7 backdrop-blur-md',
              })}
            >
              {t('hero.secondary')}
            </Link>
          </div>
          <div className="text-muted mt-10 flex items-center gap-4 text-sm">
            <div className="flex -space-x-2.5">
              {[venueImg, cateringImg, photographyImg, djImg].map((img, index) => (
                <Image
                  key={index}
                  src={img}
                  alt={t('decorativeAlt')}
                  sizes="36px"
                  className="border-bg size-9 rounded-full border-2 object-cover"
                />
              ))}
            </div>
            <p className="flex items-center gap-2">
              <ShieldCheck className="text-success size-4 shrink-0" aria-hidden />
              {t('hero.note')}
            </p>
          </div>
        </div>

        <EventCard3D t={t} />
      </div>
    </section>
  );
}

/** Tilted event card with a photo cover and glass layers at different depths. Decorative. */
function EventCard3D({ t }: { t: T }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[560px] [perspective:1800px] lg:max-w-none">
      <div className="relative [transform-style:preserve-3d] [transform:rotateY(-10deg)_rotateX(6deg)] lg:[transform:rotateY(-18deg)_rotateX(8deg)_rotateZ(1deg)]">
        {/* Card */}
        <div className="border-border/70 bg-bg overflow-hidden rounded-[32px] border shadow-[40px_60px_120px_-40px_rgb(0_0_0/0.55)]">
          <div className="relative aspect-[4/3.1] overflow-hidden">
            <Image
              src={heroImg}
              alt={t('decorativeAlt')}
              priority
              placeholder={'blur' as const}
              sizes="(min-width: 1024px) 600px, 100vw"
              className="size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />
            <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/25 backdrop-blur-md">
              <span className="size-1.5 rounded-full bg-[#28c840]" />
              {t('mock.live')}
            </div>
            <div className="absolute inset-x-0 bottom-0 p-6 text-white">
              <p className="text-xs font-medium tracking-[0.2em] uppercase opacity-80">{t('mock.eventMeta')}</p>
              <p className="font-display mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{t('mock.eventName')}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-px bg-[color-mix(in_oklab,var(--border)_70%,transparent)]">
            <MockStat label={t('mock.rsvp')} value="86" sub={t('mock.coming')} pct={72} />
            <MockStat label={t('mock.budget')} value="62%" sub={t('mock.paid')} pct={62} />
            <MockStat label={t('mock.tasks')} value="18/24" sub={t('mock.done')} pct={75} />
          </div>
        </div>

        {/* Floating: chat (front-left, closest) */}
        <div className="tiwa-float absolute top-[16%] -left-3 sm:top-[42%] w-[15.5rem] [transform:translateZ(110px)] sm:-left-14">
          <div className="border-border/70 bg-bg/85 flex items-start gap-3 rounded-2xl border p-3.5 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.4)] backdrop-blur-xl">
            <Image
              src={cateringImg}
              alt={t('decorativeAlt')}
              sizes="40px"
              className="size-10 shrink-0 rounded-full object-cover"
            />
            <div className="text-left text-sm">
              <p className="flex items-center gap-1 font-semibold">
                {t('mock.chatFrom')}
                <BadgeCheck className="text-brand size-3.5" />
              </p>
              <p className="text-muted leading-snug">{t('mock.chat')}</p>
            </div>
          </div>
        </div>

        {/* Floating: booking confirmed (top-right) */}
        <div className="tiwa-float-slow absolute -top-6 -right-2 [transform:translateZ(80px)] sm:-right-10">
          <div className="border-border/70 bg-bg/85 flex items-center gap-3 rounded-2xl border p-3 pr-4 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.4)] backdrop-blur-xl">
            <span className="bg-success-soft text-success grid size-9 place-items-center rounded-full">
              <Check className="size-4" />
            </span>
            <div className="text-left">
              <p className="text-sm font-semibold">{t('chat.booked')}</p>
              <p className="text-muted text-xs">{t('mock.venueBooked')}</p>
            </div>
          </div>
        </div>

        {/* Floating: moments strip (right, mid depth) */}
        <div className="tiwa-float absolute -right-3 bottom-24 hidden [transform:translateZ(60px)] sm:block lg:-right-14">
          <div className="border-border/70 bg-bg/85 rounded-2xl border p-2.5 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.4)] backdrop-blur-xl">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-left text-xs font-semibold">
              <Camera className="text-brand size-3.5" />
              {t('mock.moments')}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {[venueImg, photographyImg, djImg, heroImg].map((img, index) => (
                <Image
                  key={index}
                  src={img}
                  alt={t('decorativeAlt')}
                  sizes="56px"
                  className="size-14 rounded-lg object-cover"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div
        className="absolute inset-x-12 -bottom-14 h-24 rounded-full blur-3xl"
        style={{ background: 'color-mix(in oklab, var(--brand) 35%, transparent)' }}
      />
    </div>
  );
}

function MockStat({ label, value, sub, pct }: { label: string; value: string; sub: string; pct: number }) {
  return (
    <div className="bg-bg p-4 text-left">
      <p className="text-muted text-[11px] font-medium tracking-wide uppercase">{label}</p>
      <p className="font-display text-lg font-bold sm:text-2xl">{value}</p>
      <div className="bg-surface-2 mt-2 h-1.5 overflow-hidden rounded-full">
        <div className="from-brand to-accent h-full rounded-full bg-gradient-to-r" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-muted mt-1 hidden text-xs sm:block">{sub}</p>
    </div>
  );
}

/* ───────────── Marketplace ───────────── */

function Marketplace({ t }: { t: T }) {
  const currency = currencyForCountry();
  const vendors = [
    {
      key: 'one',
      category: VENDOR_CATEGORIES.venue,
      rating: '4.9',
      reviews: 128,
      fromMinor: '150000000',
      image: venueImg,
      instant: true,
    },
    {
      key: 'two',
      category: VENDOR_CATEGORIES.catering,
      rating: '4.8',
      reviews: 342,
      fromMinor: '45000000',
      image: cateringImg,
      instant: false,
    },
    {
      key: 'three',
      category: VENDOR_CATEGORIES.photography,
      rating: '5.0',
      reviews: 87,
      fromMinor: '35000000',
      image: photographyImg,
      instant: false,
    },
    {
      key: 'four',
      category: VENDOR_CATEGORIES.dj,
      rating: '4.9',
      reviews: 211,
      fromMinor: '20000000',
      image: djImg,
      instant: true,
    },
  ] as const;

  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <SectionHead eyebrow={t('market.eyebrow')} title={t('market.title')} body={t('market.body')} align="left" />
          <Link
            href="/vendors"
            className={buttonClasses({ variant: 'secondary', className: 'group shrink-0 rounded-full' })}
          >
            {t('market.cta')}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 [perspective:1200px]">
          {vendors.map((vendor, index) => (
            <li
              key={vendor.key}
              className={cn(
                'group border-border/80 bg-bg relative overflow-hidden rounded-3xl border shadow-1',
                'transition-all duration-500 [transform-style:preserve-3d]',
                'hover:shadow-[0_30px_60px_-20px_rgb(0_0_0/0.35)] hover:[transform:rotateX(6deg)_rotateY(-6deg)_translateY(-6px)]',
                index % 2 === 1 && 'lg:translate-y-8',
              )}
            >
              <div className="bg-surface-2 relative h-48 overflow-hidden">
                <Image
                  src={vendor.image}
                  alt={t('decorativeAlt')}
                  placeholder={'blur' as const}
                  sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw"
                  className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/25" />
                <span className="absolute top-3 left-3 rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
                  {vendor.category}
                </span>
                {vendor.instant && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-black">
                    <Zap className="size-3" />
                    {t('market.instant')}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2 p-5">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-display truncate text-lg font-bold">{t(`market.vendors.${vendor.key}.name`)}</h3>
                  <BadgeCheck className="text-brand size-4 shrink-0" aria-label={t('market.verified')} />
                </div>
                <p className="text-muted text-sm">
                  {t(`market.vendors.${vendor.key}.area`)} · {t(`market.vendors.${vendor.key}.tag`)}
                </p>
                <div className="border-border/70 mt-2 flex items-end justify-between gap-2 border-t pt-3 text-sm">
                  <span className="flex flex-col">
                    <span className="flex items-center gap-1">
                      <Star className="fill-accent text-accent size-4" aria-hidden />
                      <span className="font-semibold">{vendor.rating}</span>
                    </span>
                    <span className="text-muted text-xs">{t('market.reviews', { count: vendor.reviews })}</span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-muted text-xs">{t('market.from')}</span>
                    <span className="font-display text-base font-bold">
                      <MoneyText value={vendor.fromMinor} currency={currency} />
                    </span>
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ───────────── Chat showcase ───────────── */

function Chat({ t }: { t: T }) {
  const currency = currencyForCountry();
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(40% 50% at 75% 50%, color-mix(in oklab, var(--brand) 14%, transparent), transparent 70%)',
        }}
      />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionHead eyebrow={t('chat.eyebrow')} title={t('chat.title')} body={t('chat.body')} align="left" />
          <ul className="mt-8 flex flex-col gap-4">
            {(['one', 'two', 'three'] as const).map((key) => (
              <li key={key} className="flex items-center gap-3">
                <span className="bg-brand-soft text-brand grid size-8 shrink-0 place-items-center rounded-full">
                  <Check className="size-4" aria-hidden />
                </span>
                <span className="text-lg">{t(`chat.points.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Phone in 3D */}
        <div aria-hidden className="relative mx-auto w-full max-w-[340px] [perspective:1400px]">
          <div className="tiwa-float-slow relative [transform:rotateY(-14deg)_rotateX(6deg)] [transform-style:preserve-3d]">
            <div className="rounded-[44px] bg-gradient-to-b from-[#2a2a33] to-[#0b0b0f] p-2.5 shadow-[30px_40px_80px_-20px_rgb(0_0_0/0.5)]">
              <div className="bg-bg flex h-[600px] flex-col overflow-hidden rounded-[36px]">
                {/* Thread header */}
                <div className="border-border/70 flex items-center gap-3 border-b px-4 pt-8 pb-3">
                  <span className="from-brand to-accent grid size-10 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-white">
                    {t('mockInitials')}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{t('chat.thread')}</p>
                    <p className="text-success flex items-center gap-1 text-xs">
                      <span className="bg-success size-1.5 rounded-full" />
                      {t('chat.online')}
                    </p>
                  </div>
                  <BadgeCheck className="text-brand size-5" />
                </div>

                {/* Messages */}
                <div className="bg-surface flex flex-1 flex-col gap-3 overflow-hidden px-3 py-4 text-[13px] leading-snug">
                  <Bubble mine>{t('chat.msg1')}</Bubble>
                  <Bubble>{t('chat.msg2')}</Bubble>
                  <div className="border-border/80 bg-bg w-[85%] overflow-hidden rounded-2xl rounded-bl-md border shadow-1">
                    <div className="from-brand to-accent h-1.5 bg-gradient-to-r" />
                    <div className="p-3">
                      <p className="text-muted text-[11px] font-semibold tracking-wide uppercase">
                        {t('chat.quoteTitle')}
                      </p>
                      <p className="font-display mt-1 text-xl font-bold">
                        <MoneyText value="96000000" currency={currency} />
                      </p>
                      <p className="text-muted text-xs">{t('chat.quoteItems')}</p>
                      <div className="mt-3 flex gap-2">
                        <span className="bg-brand-strong text-on-brand flex-1 rounded-full py-1.5 text-center text-xs font-semibold">
                          {t('chat.accept')}
                        </span>
                        <span className="border-border flex-1 rounded-full border py-1.5 text-center text-xs font-semibold">
                          {t('chat.view')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Bubble mine seen={t('chat.seen')}>
                    {t('chat.msg3')}
                  </Bubble>
                  <div className="bg-success-soft text-success mx-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                    <ShieldCheck className="size-3.5" />
                    {t('chat.booked')}
                  </div>
                  <div className="bg-bg flex w-14 items-center justify-center gap-1 rounded-2xl rounded-bl-md px-3 py-2.5 shadow-1">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="tiwa-dot bg-muted size-1.5 rounded-full"
                        style={{ animationDelay: `${dot * 0.15}s`, backgroundColor: 'var(--text-muted)' }}
                      />
                    ))}
                  </div>
                </div>

                {/* Composer */}
                <div className="border-border/70 flex items-center gap-2 border-t px-3 py-3">
                  <Paperclip className="text-muted size-5" />
                  <span className="bg-surface text-muted flex-1 rounded-full px-4 py-2 text-sm">
                    {t('chat.composer')}
                  </span>
                  <span className="bg-brand-strong text-on-brand grid size-9 place-items-center rounded-full">
                    <SendHorizontal className="size-4" />
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div
            className="absolute inset-x-6 -bottom-8 h-16 rounded-full blur-3xl"
            style={{ background: 'color-mix(in oklab, var(--brand) 35%, transparent)' }}
          />
        </div>
      </div>
    </section>
  );
}

function Bubble({ mine = false, seen, children }: { mine?: boolean; seen?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex max-w-[82%] flex-col gap-1', mine && 'self-end items-end')}>
      <p
        className={cn(
          'rounded-2xl px-3.5 py-2.5 shadow-1',
          mine ? 'bg-brand-strong text-on-brand rounded-br-md' : 'bg-bg rounded-bl-md',
        )}
      >
        {children}
      </p>
      {seen && (
        <span className="text-muted flex items-center gap-1 text-[11px]">
          <CheckCheck className="text-brand size-3.5" />
          {seen}
        </span>
      )}
    </div>
  );
}

/* ───────────── Features bento ───────────── */

function Features({ t }: { t: T }) {
  const items = [
    { key: 'plan', icon: ClipboardList, span: 'lg:col-span-2' },
    { key: 'guests', icon: Ticket, span: '' },
    { key: 'money', icon: Wallet, span: '' },
    { key: 'vendors', icon: Store, span: '' },
    { key: 'moments', icon: Camera, span: '' },
  ] as const;
  const steps = ['one', 'two', 'three', 'four'] as const;
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHead eyebrow={t('features.eyebrow')} title={t('features.title')} body={t('features.body')} />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ key, icon: Icon, span }) => (
            <li
              key={key}
              className={cn(
                'group border-border/80 bg-surface relative overflow-hidden rounded-3xl border p-7 transition-colors duration-300',
                'hover:border-brand/40',
                span,
              )}
            >
              <div
                aria-hidden
                className="absolute -top-16 -right-16 size-48 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
                style={{ background: 'color-mix(in oklab, var(--brand) 25%, transparent)' }}
              />
              <span className="from-brand to-accent relative mb-6 grid size-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-[0_8px_24px_-8px_var(--brand)]">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="font-display relative mb-2 text-xl font-bold">{t(`features.items.${key}.title`)}</h3>
              <p className="text-muted relative leading-relaxed">{t(`features.items.${key}.body`)}</p>
            </li>
          ))}
          <li className="border-border/80 bg-surface rounded-3xl border p-7 sm:col-span-2 lg:col-span-3">
            <p className="text-brand-strong mb-4 text-xs font-semibold tracking-[0.2em] uppercase">
              {t('how.eyebrow')}
            </p>
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => (
                <li key={step} className="flex items-baseline gap-3">
                  <span className="font-display text-brand text-sm font-bold">0{index + 1}</span>
                  <span className="font-medium">{t(`how.steps.${step}.title`)}</span>
                </li>
              ))}
            </ol>
          </li>
        </ul>
      </div>
    </section>
  );
}

/* ───────────── Final CTA ───────────── */

function FinalCta({ t }: { t: T }) {
  return (
    <section className="px-5 pb-20 sm:px-6 sm:pb-28">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] border border-white/10 bg-[#0b0b0f] px-6 py-16 text-center text-white sm:px-12 sm:py-24">
        <div aria-hidden className="tiwa-grid-bg absolute inset-0 opacity-40" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(50% 70% at 50% 0%, color-mix(in oklab, var(--brand) 55%, transparent), transparent 70%)',
          }}
        />
        <div className="relative flex flex-col items-center gap-6">
          <h2 className="font-display max-w-3xl text-4xl font-bold tracking-[-0.02em] text-balance sm:text-6xl">
            {t('cta.title')}
          </h2>
          <p className="max-w-lg text-lg text-white/70">{t('cta.body')}</p>
          <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/signup"
              className={buttonClasses({
                size: 'lg',
                className: 'rounded-full bg-white px-7 text-black shadow-none hover:brightness-95',
              })}
            >
              {t('cta.primary')}
              <ArrowRight className="size-5" aria-hidden />
            </Link>
            <Link
              href="/signup"
              className={buttonClasses({
                variant: 'ghost',
                size: 'lg',
                className: 'rounded-full border border-white/25 px-7 text-white hover:bg-white/10',
              })}
            >
              {t('vendorCta.cta')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHead({
  eyebrow,
  title,
  body,
  align = 'center',
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div
      className={cn(
        'flex max-w-2xl flex-col gap-4',
        align === 'center' ? 'mx-auto items-center text-center' : 'items-start text-left',
      )}
    >
      <p className="text-brand-strong text-xs font-semibold tracking-[0.2em] uppercase">{eyebrow}</p>
      <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-balance sm:text-5xl">{title}</h2>
      {body && <p className="text-muted text-lg leading-relaxed text-pretty">{body}</p>}
    </div>
  );
}
