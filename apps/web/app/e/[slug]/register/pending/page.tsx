import { bankName } from '@tiwa/config';
import { ticketOrderPayee } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, Card, DateText, GuestShell, MoneyText, buttonClasses } from '@tiwa/ui';
import { BadgeCheck, Landmark } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HERO_GRADIENT, HeroDecor } from '@/components/hero-decor.js';
import { CopyButton } from './copy-button.js';

export const dynamic = 'force-dynamic';

/** Paid-order pending page (D-X110): amount, reference and where to pay; the organiser confirms. */
export default async function PendingPage({
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const query = await searchParams;
  const t = await getTranslations('register');
  const data = query.order ? await ticketOrderPayee(query.order).catch(() => null) : null;
  if (!data) notFound();
  const { order, event, payee } = data;
  if (order.status === 'PAID') {
    const ticket = await prisma.ticket.findFirst({ where: { orderId: order.id }, select: { id: true } });
    return (
      <GuestShell title={event.name}>
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <BadgeCheck aria-hidden className="text-success size-10" />
          <p className="font-semibold">{t('paidAlready')}</p>
          {ticket && (
            <Link href={`/t/${ticket.id}`} className={buttonClasses({})}>
              {t('viewTickets')}
            </Link>
          )}
        </Card>
      </GuestShell>
    );
  }
  return (
    <GuestShell title={event.name}>
      <div className="flex flex-col gap-4 py-4">
        <Card className="flex flex-col gap-2 p-5">
          <h1 className="font-display text-xl font-bold">{t('orderPending')}</h1>
          <p className="text-muted text-sm">{t('paidNote')}</p>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div className="bg-surface-2 rounded-2xl p-3">
              <p className="text-muted text-xs">{t('amount')}</p>
              <p className="font-display text-xl font-bold tabular-nums">
                <MoneyText value={order.totalMinor} currency={event.currency} />
              </p>
            </div>
            <div className="bg-surface-2 rounded-2xl p-3">
              <p className="text-muted text-xs">{t('reference')}</p>
              <p className="font-display text-xl font-bold tracking-wider">{order.reference}</p>
            </div>
          </div>
          {order.status === 'RESERVED' && (
            <p className="text-muted text-xs">
              {t('reservedUntil')}
              <DateText value={order.reservedUntil} format="datetime" />
            </p>
          )}
        </Card>
        {payee ? (
          <section
            aria-label={t('payTo')}
            className={`relative isolate overflow-hidden rounded-3xl p-5 text-white ${HERO_GRADIENT}`}
          >
            <HeroDecor markSize={140} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-white/60 uppercase">{t('payTo')}</p>
                <p className="mt-1 text-sm font-semibold text-white/85">
                  {bankName(event.countryCode, payee.bankCode)}
                </p>
              </div>
              <Landmark aria-hidden className="size-5 text-white/60" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="font-display text-2xl tracking-[0.12em] tabular-nums">{payee.accountNumber}</p>
              <CopyButton value={payee.accountNumber} label={t('copy')} done={t('copied')} />
            </div>
            <p className="mt-2 text-sm font-medium">{payee.accountName}</p>
            {payee.verified && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-white/70">
                <BadgeCheck aria-hidden className="size-3.5" />
                {payee.orgName}
              </p>
            )}
          </section>
        ) : (
          <Banner tone="info">{t('noBank')}</Banner>
        )}
      </div>
    </GuestShell>
  );
}
