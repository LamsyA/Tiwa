import { getPublicEvent } from '@tiwa/core';
import { Banner, Card, DateText, GuestShell } from '@tiwa/ui';
import { CalendarDays, MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { privateStorage } from '@/lib/storage.js';
import { TicketSelector } from './ticket-selector.js';
import { WaitlistForm } from './waitlist-form.js';

export const dynamic = 'force-dynamic';

/** TKT-01 + Frontend.md §6.2: public event page with ticket selector island. */
export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations('publicEvent');
  const data = await getPublicEvent(slug).catch(() => null);
  if (!data) notFound();
  const { event, types } = data;
  const venue = event.days[0]?.venueName ?? null;
  const coverUrl = event.coverKey
    ? await privateStorage()
        .getSignedUrl(event.coverKey, 3600)
        .catch(() => null)
    : null;
  return (
    <GuestShell
      title={event.name}
      cover={coverUrl ? <img src={coverUrl} alt={event.name} className="size-full object-cover" /> : undefined}
      coverAlt={event.name}
    >
      <div className="flex flex-col gap-4 py-4">
        <Card className="flex flex-col gap-2 p-4">
          <h1 className="font-display text-2xl font-bold">{event.name}</h1>
          {event.startsAt && (
            <p className="text-muted flex items-center gap-2 text-sm">
              <CalendarDays aria-hidden className="size-4" />
              <DateText value={event.startsAt} format="datetime" timeZone={event.timezone} />
            </p>
          )}
          {venue && (
            <p className="text-muted flex items-center gap-2 text-sm">
              <MapPin aria-hidden className="size-4" />
              {venue}
            </p>
          )}
          {event.description && <p className="text-sm">{event.description}</p>}
          <p className="text-muted text-sm">
            {t('organiser')}: {event.createdBy.name}
          </p>
        </Card>
        {event.programme.length > 0 && (
          <Card className="flex flex-col gap-2 p-4">
            <h2 className="font-display text-lg font-bold tracking-tight">{t('agenda')}</h2>
            {event.programme.slice(0, 20).map((item) => (
              <div key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{item.title}</span>
                {item.startsAt && <DateText value={item.startsAt} format="time" timeZone={event.timezone} />}
              </div>
            ))}
          </Card>
        )}
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="font-display text-lg font-bold tracking-tight">{t('tickets')}</h2>
          {types.length === 0 && <Banner tone="warning">{t('soldOut')}</Banner>}
          <TicketSelector
            slug={slug}
            currency={event.currency}
            types={types.map((row) => ({
              id: row.id,
              name: row.name,
              description: row.description,
              priceMinor: row.priceMinor,
              available: row.available,
              maxPerOrder: row.maxPerOrder,
              onSale: row.onSale,
            }))}
          />
          {types.length > 0 && types.every((row) => !row.onSale || row.available === 0) && <WaitlistForm slug={slug} />}
        </Card>
      </div>
    </GuestShell>
  );
}
