import { getEventVendorCategories } from '@tiwa/core';
import { Card, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';

/** Event vendors board (P6-T07): template categories with shortlist signal, linking into filtered search. */
export default async function EventVendorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const { ctx, access, allowed, invitesOn, momentsOn } = await loadEventPage(eventId, '/vendors');
  const t = await getTranslations('marketplace');
  if (!allowed) {
    return (
      <EventFrame
        eventId={eventId}
        userId={ctx.actor.userId}
        access={access}
        active="vendors"
        title={t('eventVendorsTitle')}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
      >
        <Forbidden eventId={eventId} />
      </EventFrame>
    );
  }
  const categories = await getEventVendorCategories(ctx.actor, { eventId });
  return (
    <EventFrame
      eventId={eventId}
      userId={ctx.actor.userId}
      access={access}
      active="vendors"
      title={t('eventVendorsTitle')}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
    >
      <div className="flex flex-col gap-3 py-4">
        <p className="text-muted text-sm">{t('eventVendorsBody')}</p>
        <ul className="flex flex-col gap-3">
          {categories.map((row) => (
            <li key={row.category}>
              <Card>
                <div className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{row.label}</p>
                    {row.shortlisted > 0 && (
                      <StatusPill tone="brand">{t('shortlistedCount', { count: row.shortlisted })}</StatusPill>
                    )}
                  </div>
                  <Link
                    href={
                      row.category === 'venue'
                        ? `/venues?eventId=${eventId}`
                        : `/events/${eventId}/vendors/${encodeURIComponent(row.category)}`
                    }
                    className="text-sm font-medium underline"
                  >
                    {row.category === 'venue' ? t('findButton') : t('viewButton')}
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </EventFrame>
  );
}
