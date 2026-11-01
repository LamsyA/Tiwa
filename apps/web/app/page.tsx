import { eventTypeCards } from '@tiwa/config';
import { ThemeToggle, buttonClasses, cn } from '@tiwa/ui';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardList,
  MessageCircle,
  Sparkles,
  Store,
  Ticket,
  Users,
  Wallet,
  Briefcase,
  PartyPopper,
  UserRound,
  Check,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export const dynamic = 'force-static';

/**
 * Public home (Frontend.md §6 "/ Home", static). Phone-first, light/dark from
 * tokens, no images: the hero preview is drawn in HTML/CSS so the LCP is the
 * headline text and the page ships almost no JavaScript (only the theme
 * switch). Event types come from config, never hard-coded.
 */
export default async function Home() {
  const t = await getTranslations('landing');
  const app = await getTranslations('app');
  const types = eventTypeCards();

  const features = [
    { key: 'plan', icon: ClipboardList },
    { key: 'guests', icon: Ticket },
    { key: 'vendors', icon: Store },
    { key: 'money', icon: Wallet },
    { key: 'chat', icon: MessageCircle },
    { key: 'moments', icon: Camera },
  ] as const;
  const steps = ['one', 'two', 'three', 'four'] as const;
  const roles = [
    { key: 'host', icon: PartyPopper },
    { key: 'planner', icon: Briefcase },
    { key: 'vendor', icon: Store },
    { key: 'guest', icon: UserRound },
  ] as const;

  return (
    <div className="bg-bg text-text min-h-dvh overflow-x-clip">
      {/* Header */}
      <header className="border-border/60 bg-bg/80 sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label={app('name')}>
            <span className="bg-brand text-on-brand grid size-8 place-items-center rounded-lg shadow-1">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <span className="font-display text-xl font-bold tracking-tight">{app('name')}</span>
          </Link>
          <nav aria-label={t('nav.menu')} className="text-muted ml-6 hidden items-center gap-6 text-sm md:flex">
            <a href="#features" className="hover:text-text transition-colors">
              {t('nav.features')}
            </a>
            <a href="#how" className="hover:text-text transition-colors">
              {t('nav.how')}
            </a>
            <a href="#vendors" className="hover:text-text transition-colors">
              {t('nav.vendors')}
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <ThemeToggle labels={{ light: t('theme.light'), dark: t('theme.dark') }} />
            <Link
              href="/login"
              className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'hidden sm:inline-flex' })}
            >
              {t('nav.login')}
            </Link>
            <Link href="/signup" className={buttonClasses({ size: 'sm', className: 'rounded-full px-4' })}>
              {t('nav.start')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                'radial-gradient(60% 50% at 15% 10%, color-mix(in oklab, var(--brand) 18%, transparent), transparent 70%),' +
                'radial-gradient(45% 40% at 90% 20%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 70%)',
            }}
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-24">
            <div className="flex flex-col items-start gap-6">
              <span className="border-border bg-surface/80 text-muted inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium sm:text-sm">
                <span className="bg-brand size-1.5 rounded-full" aria-hidden />
                {t('hero.badge')}
              </span>
              <h1 className="font-display text-[2.6rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl">
                {t('hero.titleA')}{' '}
                <span className="from-brand to-accent bg-gradient-to-r bg-clip-text text-transparent">
                  {t('hero.titleB')}
                </span>
              </h1>
              <p className="text-muted max-w-xl text-lg leading-relaxed text-pretty sm:text-xl">{t('hero.body')}</p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link
                  href="/signup"
                  className={buttonClasses({ size: 'lg', className: 'group rounded-full shadow-2' })}
                >
                  {t('hero.primary')}
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
                <Link
                  href="/vendors"
                  className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'rounded-full' })}
                >
                  {t('hero.secondary')}
                </Link>
              </div>
              <p className="text-muted flex items-center gap-2 text-sm">
                <CheckCircle2 className="text-success size-4" aria-hidden />
                {t('hero.note')}
              </p>
            </div>

            <HeroPreview t={t} />
          </div>
        </section>

        {/* Event types */}
        <section aria-labelledby="types" className="border-border/60 border-y py-8">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id="types" className="text-muted mb-4 text-center text-sm font-medium tracking-wide uppercase">
              {t('types.title')}
            </h2>
            <ul className="flex flex-wrap justify-center gap-2">
              {types.map((type) => (
                <li
                  key={type.key}
                  className="border-border bg-surface text-text rounded-full border px-4 py-1.5 text-sm"
                >
                  {type.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
          <SectionHead eyebrow={t('features.eyebrow')} title={t('features.title')} body={t('features.body')} />
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="group border-border bg-surface relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2"
              >
                <span className="bg-brand-soft text-brand mb-5 grid size-11 place-items-center rounded-xl">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-display mb-2 text-lg font-bold">{t(`features.items.${key}.title`)}</h3>
                <p className="text-muted leading-relaxed">{t(`features.items.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section id="how" className="bg-surface scroll-mt-20 py-20 lg:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead eyebrow={t('how.eyebrow')} title={t('how.title')} />
            <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => (
                <li key={step} className="relative flex flex-col gap-3">
                  <span className="font-display text-brand text-5xl font-bold opacity-90">0{index + 1}</span>
                  <h3 className="font-display text-lg font-bold">{t(`how.steps.${step}.title`)}</h3>
                  <p className="text-muted leading-relaxed">{t(`how.steps.${step}.body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Roles */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <SectionHead eyebrow={t('roles.eyebrow')} title={t('roles.title')} />
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map(({ key, icon: Icon }) => (
              <li key={key} className="border-border rounded-2xl border p-6">
                <Icon className="text-brand mb-4 size-6" aria-hidden />
                <h3 className="font-display mb-1 text-lg font-bold">{t(`roles.${key}.title`)}</h3>
                <p className="text-muted">{t(`roles.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Vendors */}
        <section id="vendors" className="mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6">
          <div className="border-border bg-surface flex flex-col items-start gap-6 rounded-3xl border p-8 sm:p-10 md:flex-row md:items-center">
            <span className="bg-brand-soft text-brand grid size-14 shrink-0 place-items-center rounded-2xl">
              <Store className="size-7" aria-hidden />
            </span>
            <div className="flex-1">
              <h2 className="font-display mb-2 text-2xl font-bold">{t('vendorCta.title')}</h2>
              <p className="text-muted max-w-xl">{t('vendorCta.body')}</p>
            </div>
            <Link href="/signup" className={buttonClasses({ variant: 'secondary', className: 'rounded-full' })}>
              {t('vendorCta.cta')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 py-20 sm:px-6 lg:py-28">
          <div className="bg-text text-bg relative mx-auto max-w-6xl overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(50% 80% at 50% 0%, color-mix(in oklab, var(--brand) 45%, transparent), transparent 70%)',
              }}
            />
            <div className="relative flex flex-col items-center gap-5">
              <h2 className="font-display max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                {t('cta.title')}
              </h2>
              <p className="max-w-lg text-lg opacity-80">{t('cta.body')}</p>
              <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
                <Link href="/signup" className={buttonClasses({ size: 'lg', className: 'rounded-full' })}>
                  {t('cta.primary')}
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    buttonClasses({ variant: 'ghost', size: 'lg', className: 'rounded-full' }),
                    'text-bg border border-current/30 hover:bg-white/10',
                  )}
                >
                  {t('cta.secondary')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2">
            <span className="bg-brand text-on-brand grid size-6 place-items-center rounded-md">
              <Sparkles className="size-3" aria-hidden />
            </span>
            <span className="text-text font-display font-bold">{app('name')}</span>
            <span>· {t('footer.tagline')}</span>
          </div>
          <nav aria-label={t('footer.product')} className="flex gap-5 sm:ml-auto">
            <a href="#features" className="hover:text-text">
              {t('nav.features')}
            </a>
            <a href="#how" className="hover:text-text">
              {t('nav.how')}
            </a>
            <Link href="/login" className="hover:text-text">
              {t('nav.login')}
            </Link>
          </nav>
          <p>
            © {new Date().getFullYear()} {app('name')}. {t('footer.rights')}
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
      <p className="text-brand-strong text-sm font-semibold tracking-wide uppercase">{eyebrow}</p>
      <h2 className="font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">{title}</h2>
      {body && <p className="text-muted text-lg text-pretty">{body}</p>}
    </div>
  );
}

/** App preview drawn in HTML/CSS (no image weight; follows the theme). Decorative: hidden from screen readers. */
function HeroPreview({ t }: { t: Awaited<ReturnType<typeof getTranslations<'landing'>>> }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="border-border bg-bg relative z-10 rounded-3xl border p-5 shadow-2 sm:p-6">
        <div className="from-brand to-accent mb-5 h-28 rounded-2xl bg-gradient-to-br p-4 sm:h-32">
          <div className="flex h-full flex-col justify-end text-white">
            <p className="font-display text-xl font-bold drop-shadow-sm">{t('mock.eventName')}</p>
            <p className="text-sm opacity-90">{t('mock.eventMeta')}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MockStat label={t('mock.rsvp')} value="86" sub={t('mock.coming')} />
          <MockStat label={t('mock.budget')} value="62%" sub={t('mock.paid')} />
          <MockStat label={t('mock.tasks')} value="18/24" sub={t('mock.done')} />
        </div>
        <div className="bg-surface mt-4 h-2 overflow-hidden rounded-full">
          <div className="from-brand to-accent h-full w-[62%] rounded-full bg-gradient-to-r" />
        </div>
        <ul className="mt-5 flex flex-col gap-2.5 text-sm">
          {[0, 1, 2].map((row) => (
            <li key={row} className="flex items-center gap-3">
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full',
                  row < 2 ? 'bg-success text-bg' : 'border-border border-2',
                )}
              >
                {row < 2 && <Check className="size-3" />}
              </span>
              <span
                className={cn('bg-surface-2 h-2.5 rounded-full', row === 0 ? 'w-40' : row === 1 ? 'w-32' : 'w-44')}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* Floating chat bubble */}
      <div className="border-border bg-bg absolute -bottom-6 -left-3 z-20 flex max-w-[16rem] items-start gap-3 rounded-2xl border p-3 shadow-2 sm:-left-8">
        <span className="bg-brand-soft text-brand grid size-9 shrink-0 place-items-center rounded-full">
          <MessageCircle className="size-4" />
        </span>
        <div className="text-sm">
          <p className="font-medium">{t('mock.chatFrom')}</p>
          <p className="text-muted">{t('mock.chat')}</p>
        </div>
      </div>

      {/* Floating Moments card */}
      <div className="border-border bg-bg absolute -top-5 -right-2 z-20 hidden rounded-2xl border p-3 shadow-2 sm:block lg:-right-6">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Camera className="text-brand size-4" />
          {t('mock.moments')}
        </p>
        <div className="grid grid-cols-3 gap-1">
          {[
            'from-brand to-accent',
            'from-accent to-brand-soft',
            'from-brand-strong to-brand',
            'from-brand-soft to-brand',
            'from-accent to-brand',
            'from-brand to-brand-strong',
          ].map((tone, index) => (
            <span key={index} className={cn('size-9 rounded-md bg-gradient-to-br', tone)} />
          ))}
        </div>
        <p className="text-muted mt-2 flex items-center gap-1 text-xs">
          <Users className="size-3" />
          {t('mock.newPhotos')}
        </p>
      </div>

      <div
        className="absolute inset-x-8 -bottom-4 -z-0 h-16 rounded-full blur-3xl"
        style={{ background: 'color-mix(in oklab, var(--brand) 35%, transparent)' }}
      />
    </div>
  );
}

function MockStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface rounded-xl p-3">
      <p className="text-muted text-xs">{label}</p>
      <p className="font-display text-lg font-bold">{value}</p>
      <p className="text-muted text-xs">{sub}</p>
    </div>
  );
}
