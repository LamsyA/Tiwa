import { env } from '@tiwa/config';
import { checkinQrValue, invitePage, verifyRsvp } from '@tiwa/core';
import { GuestShell } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { InviteClient } from './invite-client.js';
import { googleCalendarUrl } from '@/lib/ics.js';

export const dynamic = 'force-dynamic';

/**
 * UF-08: guest invitation page — no account, no app. Cover, name, host,
 * date/venue, two big buttons. Email one-tap links land with ?r=&sig=
 * (verified, never trusted): the client island POSTs on load. Plain GETs
 * record nothing.
 */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ r?: string; sig?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const t = await getTranslations('invite');
  const page = await invitePage(decodeURIComponent(token)).catch(() => null);
  if (!page) notFound();

  const secret = env.AUTH_SECRET;
  const preset =
    query.r === 'yes' || query.r === 'no'
      ? secret && verifyRsvp(page.token, query.r, query.sig ?? '', secret)
        ? (query.r.toUpperCase() as 'YES' | 'NO')
        : null
      : null;

  const base = env.APP_URL.replace(/\/$/, '');
  const checkin = secret ? checkinQrValue(page.guest.id, page.event.id, secret) : '';
  const calendar = page.event.startsAt
    ? googleCalendarUrl({
        title: page.event.name,
        details: page.event.description ?? undefined,
        location: page.event.venueName ?? undefined,
        startsAt: page.event.startsAt,
        endsAt: page.event.endsAt,
      })
    : null;

  return (
    <GuestShell title={page.event.name}>
      <InviteClient
        data={{
          token: page.token,
          guest: {
            name: page.guest.name,
            rsvp: page.guest.rsvp,
            plusOnes: page.guest.plusOnes,
            meal: page.guest.meal,
            dietary: page.guest.dietary,
          },
          event: {
            name: page.event.name,
            description: page.event.description,
            startsAt: page.event.startsAt?.toISOString() ?? null,
            endsAt: page.event.endsAt?.toISOString() ?? null,
            timezone: page.event.timezone,
            venueName: page.event.venueName,
            hostName: page.event.hostName,
            dressCode: page.event.dressCode,
            momentsOn: page.event.momentsOn,
            allowForwarding: page.event.allowForwarding,
          },
          presetResponse: preset,
          checkinQr: checkin,
          googleCalUrl: calendar,
          icsUrl: `${base}/api/ics/${page.token}?kind=invite`,
          passUrl: `${base}/i/${page.token}/pass`,
          shareText: t('forwardText', { event: page.event.name, link: `${base}/i/${page.token}` }),
        }}
      />
    </GuestShell>
  );
}
