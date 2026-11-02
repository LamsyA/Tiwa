import { listShortlist, loadEventAccess } from '@tiwa/core';
import { VENDOR_CATEGORIES } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { MoneyText, buttonClasses } from '@tiwa/ui';
import { ArrowLeft, BadgeCheck, CalendarCheck, CalendarX, Star } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type * as React from 'react';
import { MessageBusiness } from '@/components/chat/message-business.js';
import { MarketplaceFrame, coverFor, plannerCover } from '@/components/marketplace/marketplace-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ShortlistButton } from './search.js';

const FRESH_MS = 14 * 86_400_000;

function calendarFresh(at: Date | null | undefined): boolean {
  return Boolean(at) && Date.now() - at!.getTime() < FRESH_MS;
}

/** Side-by-side compare of up to 4 shortlisted businesses (MKT-05, P6-T06): one column each, one row per fact. */
export async function ComparePageBody({
  kind,
  base,
  searchParams,
}: {
  kind: 'VENDOR' | 'PLANNER';
  base: '/vendors' | '/planners';
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.eventId;
  const eventId = Array.isArray(raw) ? raw[0] : raw;
  if (!eventId) notFound();
  const ctx = await requirePageUser(`${base}/compare?eventId=${eventId}`);
  const t = await getTranslations('marketplace');
  const access = await loadEventAccess(ctx.actor.userId, eventId);
  if (!access) notFound();
  const [all, event] = await Promise.all([
    listShortlist(ctx.actor, { eventId }),
    prisma.event.findUnique({ where: { id: eventId }, select: { name: true } }),
  ]);
  const picks = all.filter((pick) => pick.org.kind === kind).slice(0, 4);
  const label = (key: string) => VENDOR_CATEGORIES[key as keyof typeof VENDOR_CATEGORIES] ?? key;

  const rows: { key: string; title: string; cell: (pick: (typeof picks)[number]) => React.ReactNode }[] = [
    {
      key: 'price',
      title: t('compareRowPrice'),
      cell: (pick) =>
        pick.org.profile?.startingPriceMinor ? (
          <span className="font-display text-lg font-bold">
            <MoneyText value={pick.org.profile.startingPriceMinor.toString()} currency={pick.org.profile.currency} />
          </span>
        ) : (
          <span className="text-muted">{t('compareOnRequest')}</span>
        ),
    },
    {
      key: 'rating',
      title: t('compareRowRating'),
      cell: (pick) =>
        pick.org.profile?.ratingAvg != null && pick.org.profile.ratingCount > 0 ? (
          <span className="flex items-center gap-1 font-semibold">
            <Star aria-hidden className="fill-accent text-accent size-4" />
            {pick.org.profile.ratingAvg.toFixed(1)}
            <span className="text-muted font-normal">({pick.org.profile.ratingCount})</span>
          </span>
        ) : (
          <span className="text-muted">{t('newOnTiwa')}</span>
        ),
    },
    {
      key: 'city',
      title: t('compareRowCity'),
      cell: (pick) => pick.org.profile?.city || '—',
    },
    {
      key: 'services',
      title: t('compareRowServices'),
      cell: (pick) => (
        <span className="flex flex-wrap gap-1">
          {(pick.org.profile?.categories ?? []).slice(0, 4).map((key) => (
            <span key={key} className="bg-surface-2 rounded-full px-2 py-0.5 text-xs">
              {label(key)}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'verified',
      title: t('compareRowVerified'),
      cell: (pick) =>
        pick.org.verification === 'APPROVED' ? (
          <span className="text-success flex items-center gap-1 font-medium">
            <BadgeCheck aria-hidden className="size-4" />
            {t('verified')}
          </span>
        ) : (
          <span className="text-muted">{t('compareNotVerified')}</span>
        ),
    },
    {
      key: 'calendar',
      title: t('compareRowCalendar'),
      cell: (pick) => {
        const at = pick.org.profile?.availabilityConfirmedAt;
        return calendarFresh(at) ? (
          <span className="text-success flex items-center gap-1 font-medium">
            <CalendarCheck aria-hidden className="size-4" />
            {t('compareCalendarFresh')}
          </span>
        ) : (
          <span className="text-warning flex items-center gap-1">
            <CalendarX aria-hidden className="size-4" />
            {t('calendarUnconfirmed')}
          </span>
        );
      },
    },
  ];

  return (
    <MarketplaceFrame
      active={kind === 'VENDOR' ? 'vendors' : 'planners'}
      title={t('compareTitle')}
      {...(event ? { subtitle: t('compareFor', { event: event.name }) } : {})}
    >
      <div className="flex flex-col gap-6">
        <Link
          href={`${base}?eventId=${eventId}`}
          className="text-muted hover:text-text inline-flex w-fit items-center gap-1.5 text-sm font-medium"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t(kind === 'VENDOR' ? 'searchVendors' : 'searchPlanners')}
        </Link>
        {picks.length === 0 ? (
          <div className="border-border/70 bg-surface flex flex-col items-center gap-3 rounded-3xl border border-dashed px-6 py-14 text-center">
            <p className="font-display text-xl font-bold">{t('compareEmptyTitle')}</p>
            <p className="text-muted max-w-md text-sm">{t('compareEmpty')}</p>
            <Link href={`${base}?eventId=${eventId}`} className={buttonClasses({ className: 'mt-2 rounded-full' })}>
              {t(kind === 'VENDOR' ? 'searchVendors' : 'searchPlanners')}
            </Link>
          </div>
        ) : (
          <div className="border-border/70 bg-surface overflow-x-auto rounded-3xl border shadow-[var(--shadow-1)]">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="w-36 p-4 text-left align-bottom">
                    <span className="sr-only">{t('compareTitle')}</span>
                  </th>
                  {picks.map((pick, index) => (
                    <th key={pick.orgId} scope="col" className="p-4 text-left align-top font-normal">
                      <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-2xl">
                        <Image
                          src={
                            kind === 'PLANNER'
                              ? plannerCover(index)
                              : coverFor(pick.org.profile?.categories ?? [], index)
                          }
                          alt=""
                          placeholder="blur"
                          sizes="260px"
                          className="size-full object-cover"
                        />
                        <div className="absolute top-2 right-2">
                          <ShortlistButton eventId={eventId} orgId={pick.orgId} initial />
                        </div>
                      </div>
                      <Link
                        href={`${base}/${pick.org.slug}?eventId=${eventId}`}
                        className="font-display block text-base font-bold hover:underline"
                      >
                        {pick.org.name}
                      </Link>
                      <span className="text-muted text-xs">@{pick.org.slug}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-border/60 border-t">
                    <th scope="row" className="text-muted p-4 text-left text-xs font-semibold tracking-wide uppercase">
                      {row.title}
                    </th>
                    {picks.map((pick) => (
                      <td key={pick.orgId} className="p-4 align-top">
                        {row.cell(pick)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-border/60 border-t">
                  <th scope="row" className="p-4">
                    <span className="sr-only">{t('compareActions')}</span>
                  </th>
                  {picks.map((pick) => (
                    <td key={pick.orgId} className="p-4 align-top">
                      <div className="flex flex-col gap-2">
                        <Link
                          href={`${base}/${pick.org.slug}?eventId=${eventId}`}
                          className={buttonClasses({ size: 'sm', className: 'rounded-full' })}
                        >
                          {t('compareRequestQuote')}
                        </Link>
                        <MessageBusiness orgId={pick.orgId} orgName={pick.org.name} variant="secondary" />
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {picks.length >= 4 && <p className="text-muted text-sm">{t('compareLimit')}</p>}
      </div>
    </MarketplaceFrame>
  );
}
