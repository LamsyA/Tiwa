import { env } from '@tiwa/config';
import { checkinQrValue, invitePage } from '@tiwa/core';
import { GuestShell, QRCode } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { googleCalendarUrl } from '@/lib/ics.js';

/** GST-15: personal pass — QR (signed check-in token), calendar, directions, Moments link from event start. */
export default async function InvitePassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('invite');
  const page = await invitePage(decodeURIComponent(token)).catch(() => null);
  if (!page) notFound();
  const secret = env.AUTH_SECRET;
  const checkin = secret ? checkinQrValue(page.guest.id, page.event.id, secret) : '';
  const base = env.APP_URL.replace(/\/$/, '');
  const calendar = page.event.startsAt
    ? googleCalendarUrl({
        title: page.event.name,
        details: page.event.description ?? undefined,
        location: page.event.venueName ?? undefined,
        startsAt: page.event.startsAt,
        endsAt: page.event.endsAt,
      })
    : null;
  const mapsUrl = page.event.venueName
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(page.event.venueName)}`
    : null;
  const momentsActive = page.event.momentsOn && (!page.event.startsAt || page.event.startsAt <= new Date());

  return (
    <GuestShell title={page.event.name}>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <p className="font-medium">{t('passFor', { name: page.guest.name })}</p>
        <QRCode value={checkin} size={224} label={t('passQr')} className="text-text max-w-60 rounded-md border p-2" />
        <div className="flex flex-col gap-2">
          {calendar && (
            <a href={calendar} target="_blank" rel="noopener noreferrer" className="text-sm underline">
              {t('googleCal')}
            </a>
          )}
          <a href={`${base}/api/ics/${page.token}?kind=invite`} download className="text-sm underline">
            {t('icsDownload')}
          </a>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">
              {t('directions')}
            </a>
          )}
          {momentsActive && page.event.id && (
            <a href={`${base}/m/${page.event.id}`} className="text-sm underline">
              {t('moments')}
            </a>
          )}
        </div>
      </div>
    </GuestShell>
  );
}
