import { prisma } from '@tiwa/db';
import { Banner, Card, DateText, EmptyState, GuestShell } from '@tiwa/ui';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { RsvpForm } from './rsvp-form.js';

export const dynamic = 'force-dynamic';

/** UF-09: public shared-link RSVP — name (+optional phone), one tap, no account. */
export default async function SharedRsvpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations('shared.rsvp');
  const event = await prisma.event.findFirst({
    where: { slug, deletedAt: null },
    select: {
      name: true,
      startsAt: true,
      timezone: true,
      sharedLinkEnabled: true,
      status: true,
      days: { orderBy: { sortOrder: 'asc' }, take: 1, select: { venueName: true } },
    },
  });
  if (!event || event.status === 'CANCELLED' || event.status === 'COMPLETED') {
    return (
      <GuestShell title={t('title')}>
        <EmptyState title={t('notFound')} body={t('notFoundBody')} icon={<Users aria-hidden />} />
      </GuestShell>
    );
  }
  if (!event.sharedLinkEnabled) {
    return (
      <GuestShell title={event.name}>
        <Banner tone="warning">{t('closedBody')}</Banner>
      </GuestShell>
    );
  }
  return (
    <GuestShell title={event.name}>
      <div className="flex flex-col gap-4 py-4">
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-muted text-sm">{t('heading')}</p>
          <p className="font-display text-2xl font-bold">{event.name}</p>
          {event.startsAt && (
            <p className="text-muted flex items-center gap-2 text-sm">
              <CalendarDays aria-hidden className="size-4" />
              <DateText value={event.startsAt} format="datetime" timeZone={event.timezone} />
            </p>
          )}
          {event.days[0]?.venueName && (
            <p className="text-muted flex items-center gap-2 text-sm">
              <MapPin aria-hidden className="size-4" />
              {event.days[0].venueName}
            </p>
          )}
        </Card>
        <RsvpForm slug={slug} />
      </div>
    </GuestShell>
  );
}
