import { TiwaLogo } from '@tiwa/ui';
import { env } from '@tiwa/config';
import { changeApprovalView, verifyChangeToken } from '@tiwa/core';
import { MoneyText } from '@tiwa/ui';
import { ArrowRight, CalendarDays, CheckCircle2, Clock, Link2Off, Users, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DecisionButtons } from './decision.js';

export const metadata: Metadata = { robots: 'noindex, nofollow' };
export const dynamic = 'force-dynamic';

/**
 * D-X84: the vendor's phone page behind the WhatsApp link. Signed out, one
 * change, one decision: what moved, the new total and the new balance.
 */
export default async function ChangeApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw);
  const t = await getTranslations('changeLink');
  const secret = env.AUTH_SECRET;
  const versionId = secret ? verifyChangeToken(token, secret) : null;
  const view = versionId ? await changeApprovalView(versionId).catch(() => null) : null;

  if (!view) {
    return (
      <Shell brand={t('brand')}>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="bg-surface-2 grid size-14 place-items-center rounded-2xl">
            <Link2Off aria-hidden className="text-muted size-6" />
          </span>
          <h1 className="font-display text-xl font-bold">{t('invalidTitle')}</h1>
          <p className="text-muted max-w-xs text-sm">{t('invalidBody')}</p>
        </div>
      </Shell>
    );
  }

  const money = (value: string) => <MoneyText value={value} currency={view.currency} />;
  const up = BigInt(view.diffMinor) >= 0n;
  const when = view.eventDate
    ? new Intl.DateTimeFormat('en', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: view.timezone,
      }).format(new Date(view.eventDate))
    : null;
  const decided = view.status !== 'PROPOSED';

  return (
    <Shell brand={t('brand')}>
      <section className="from-brand-strong relative overflow-hidden rounded-3xl bg-gradient-to-br to-[#3a1d12] p-5 text-white shadow-[var(--shadow-2)]">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-white/70 uppercase">
          {t('eyebrow', { vendor: view.vendorName })}
        </p>
        <h1 className="font-display mt-1 text-2xl leading-tight font-bold tracking-tight">{view.eventName}</h1>
        {when && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80">
            <CalendarDays aria-hidden className="size-4" />
            {when}
          </p>
        )}
        <p className="mt-4 rounded-2xl bg-white/10 px-3.5 py-3 text-sm leading-snug backdrop-blur-sm">
          <span className="font-semibold">{view.requestedBy || t('theClient')}</span> {t('asks')}
          {view.reason && <span className="mt-1 block text-white/80">{view.reason}</span>}
        </p>
      </section>

      <section className="border-border/70 bg-surface flex flex-col gap-2 rounded-3xl border p-4 shadow-[var(--shadow-1)]">
        <h2 className="text-muted flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
          <Users aria-hidden className="size-3.5" />
          {t('whatChanges')}
        </h2>
        <ul className="flex flex-col gap-2">
          {view.lines.map((line) => (
            <li key={line.name} className="bg-surface-2/70 flex items-center gap-3 rounded-2xl px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{line.name}</span>
                <span className="text-muted text-xs">
                  {t('each', { price: '' })}
                  {money(line.unitMinor)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold tabular-nums">
                <span className="text-muted line-through decoration-1">{line.from}</span>
                <ArrowRight aria-hidden className="text-muted size-3.5" />
                <span className="text-brand-strong">{line.to}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-border/70 bg-surface overflow-hidden rounded-3xl border shadow-[var(--shadow-1)]">
        <div className="flex items-end justify-between gap-3 p-4">
          <div>
            <p className="text-muted text-xs">{t('newTotal')}</p>
            <p className="font-display text-3xl font-bold tracking-tight tabular-nums">{money(view.newTotalMinor)}</p>
            <p className="text-muted mt-0.5 text-xs">
              {t('was')} <span className="line-through">{money(view.currentTotalMinor)}</span>
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${up ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}
          >
            {up ? '+' : '−'}
            {money(view.diffMinor.replace('-', ''))}
          </span>
        </div>
        <dl className="divide-border/60 border-border/60 grid grid-cols-2 divide-x border-t text-sm">
          <div className="p-4">
            <dt className="text-muted text-xs">{t('paid')}</dt>
            <dd className="font-semibold tabular-nums">{money(view.paidMinor)}</dd>
          </div>
          <div className="p-4">
            <dt className="text-muted text-xs">{t('balance')}</dt>
            <dd className="font-semibold tabular-nums">
              {money(view.balanceAfterMinor)}
              <span className="text-muted block text-[11px] font-normal">
                {t('balanceWas')} {money(view.balanceBeforeMinor)}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      {decided ? (
        <section
          className={`flex items-center gap-3 rounded-3xl p-4 ${view.status === 'ACCEPTED' ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted'}`}
        >
          {view.status === 'ACCEPTED' ? (
            <CheckCircle2 aria-hidden className="size-6 shrink-0" />
          ) : (
            <XCircle aria-hidden className="size-6 shrink-0" />
          )}
          <p className="text-sm font-semibold">{view.status === 'ACCEPTED' ? t('doneAccepted') : t('doneDeclined')}</p>
        </section>
      ) : (
        <DecisionButtons token={token} />
      )}

      <p className="text-muted flex items-center justify-center gap-1.5 text-center text-xs">
        <Clock aria-hidden className="size-3.5" />
        {t('footer')}
      </p>
    </Shell>
  );
}

function Shell({ children, brand }: { children: React.ReactNode; brand: string }) {
  return (
    <main className="bg-bg min-h-dvh">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-5 pb-10">
        <TiwaLogo size="sm" name={brand} />
        {children}
      </div>
    </main>
  );
}
