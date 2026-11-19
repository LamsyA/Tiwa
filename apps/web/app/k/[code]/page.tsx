import { TiwaLogo } from '@tiwa/ui';
import { env } from '@tiwa/config';
import { checkInFromLink, checkinStats, passCode, passEventId, verifyCheckinQr, verifyTicketQr } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { buttonClasses } from '@tiwa/ui';
import { AlertTriangle, CheckCircle2, Link2Off, ScanLine, Ticket, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getCtx } from '@/lib/ctx.js';

export const metadata: Metadata = { robots: 'noindex, nofollow' };
export const dynamic = 'force-dynamic';

/**
 * D-X91: what a phone camera opens from a pass QR. Door staff (signed in,
 * allowed to scan for the event) check the guest in on the spot and see a
 * big green / amber / red answer; anyone else sees the entry pass itself.
 */
export default async function PassLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = passCode(decodeURIComponent(raw));
  const t = await getTranslations('passLink');
  const secret = env.AUTH_SECRET;
  const valid = secret ? (verifyCheckinQr(code, secret) ?? verifyTicketQr(code, secret)) : null;
  const eventId = valid ? passEventId(code) : null;
  const event = eventId
    ? await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, timezone: true } })
    : null;

  if (!event || !secret) {
    return (
      <Shell brand={t('brand')}>
        <Panel tone="bad" icon={<Link2Off aria-hidden className="size-7" />} title={t('invalidTitle')}>
          {t('invalidBody')}
        </Panel>
      </Shell>
    );
  }

  const { actor } = await getCtx();
  const result = actor ? await checkInFromLink(actor, code, secret) : null;

  if (!result) {
    const signIn = `/login?next=${encodeURIComponent(`/k/${encodeURIComponent(code)}`)}`;
    return (
      <Shell brand={t('brand')}>
        <Panel
          tone="neutral"
          icon={<Ticket aria-hidden className="size-7" />}
          title={t('passTitle', { event: event.name })}
        >
          {t('passBody')}
        </Panel>
        <p className="text-muted px-1 text-center text-xs">
          {t('staffHint')}{' '}
          <Link href={signIn} className="text-brand-strong font-semibold hover:underline">
            {t('staffSignIn')}
          </Link>
        </p>
      </Shell>
    );
  }

  const { outcome } = result;
  const stats = actor ? await checkinStats(actor, event.id).catch(() => null) : null;
  const at = outcome.checkedInAt
    ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: event.timezone }).format(
        new Date(outcome.checkedInAt),
      )
    : '';
  const tone = outcome.result === 'OK' ? 'ok' : outcome.result === 'DUPLICATE' ? 'warn' : 'bad';
  return (
    <Shell brand={t('brand')}>
      <p className="text-muted text-sm font-medium">{event.name}</p>
      <Panel
        tone={tone}
        icon={
          tone === 'ok' ? (
            <CheckCircle2 aria-hidden className="size-8" />
          ) : tone === 'warn' ? (
            <AlertTriangle aria-hidden className="size-8" />
          ) : (
            <XCircle aria-hidden className="size-8" />
          )
        }
        title={
          tone === 'ok'
            ? t('inTitle', { name: outcome.holderName ?? t('guest') })
            : tone === 'warn'
              ? t('dupTitle', { name: outcome.holderName ?? t('guest') })
              : t('badTitle')
        }
      >
        {tone === 'ok' ? t('inBody') : tone === 'warn' ? t('dupBody', { at }) : t('badBody')}
      </Panel>
      {stats && (
        <p className="text-muted text-center text-sm" aria-live="polite">
          {t('count', { in: stats.ticketsIn + stats.guestsIn, expected: stats.expected })}
        </p>
      )}
      <Link
        href={`/events/${event.id}/check-in`}
        className={buttonClasses({ variant: 'secondary', className: 'h-12 rounded-2xl' })}
      >
        <ScanLine aria-hidden className="size-4" />
        {t('openScanner')}
      </Link>
    </Shell>
  );
}

function Panel({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'ok' | 'warn' | 'bad' | 'neutral';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const colours = {
    ok: 'bg-success-soft text-success border-success/30',
    warn: 'bg-warning-soft text-warning border-warning/30',
    bad: 'bg-danger-soft text-danger border-danger/30',
    neutral: 'bg-surface text-text border-border/70',
  }[tone];
  return (
    <section
      role={tone === 'ok' || tone === 'neutral' ? 'status' : 'alert'}
      className={`flex flex-col items-center gap-3 rounded-3xl border px-6 py-10 text-center ${colours}`}
    >
      {icon}
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-text/80 max-w-xs text-sm">{children}</p>
    </section>
  );
}

function Shell({ children, brand }: { children: React.ReactNode; brand: string }) {
  return (
    <main className="bg-bg min-h-dvh">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-5 pb-10">
        <TiwaLogo size="sm" name={brand} />
        {children}
      </div>
    </main>
  );
}
