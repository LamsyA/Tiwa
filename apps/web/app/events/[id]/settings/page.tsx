import { FORMAT_RULES } from '@tiwa/config';
import { authorize, utcToZoned } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, Card, buttonClasses } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { privateStorage } from '@/lib/storage.js';
import { SettingsForms } from './settings-forms.js';

/** P3-T10 / Frontend.md §6.3: details, members, features, visibility, appearance, danger zone. */
export default async function EventSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed } = await loadEventPage(id, '/settings', 'event.view');
  const t = await getTranslations('events');
  const ts = await getTranslations('events.settingsPage');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    select: {
      name: true,
      description: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      expectedGuests: true,
      visibility: true,
      invitesEnabled: true,
      momentsEnabled: true,
      ticketsEnabled: true,
      themeColor: true,
      coverKey: true,
      format: true,
      status: true,
    },
  });

  const can = (action: 'event.edit' | 'event.close') => {
    try {
      authorize(ctx.actor, action, { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  };
  const closed = event.status === 'CANCELLED' || event.status === 'COMPLETED';
  const canEdit = can('event.edit') && !closed;
  const rules = FORMAT_RULES[event.format];
  const start = event.startsAt ? utcToZoned(event.startsAt, event.timezone) : { date: '', time: '' };
  const end = event.endsAt ? utcToZoned(event.endsAt, event.timezone) : { date: '', time: '' };
  const coverUrl = event.coverKey ? await privateStorage().getSignedUrl(event.coverKey, 3600) : null;

  return (
    <EventFrame eventId={id} userId={ctx.actor.userId} access={access} active="settings" title={event.name}>
      <div className="flex flex-col gap-4 py-2">
        <h2 className="font-display text-xl font-bold">{ts('title')}</h2>
        {!allowed ? (
          <Forbidden eventId={id} />
        ) : (
          <>
            {closed && <Banner tone="warning">{ts('closedBanner', { status: t(`status.${event.status}`) })}</Banner>}
            {!canEdit && !closed && <Banner tone="info">{ts('readOnly')}</Banner>}
            <SettingsForms
              eventId={id}
              canEdit={canEdit}
              isHost={access.role === 'HOST'}
              status={event.status}
              eventName={event.name}
              details={{
                name: event.name,
                description: event.description ?? '',
                date: start.date,
                startTime: start.time,
                endTime: end.time,
                expectedGuests: event.expectedGuests,
              }}
              features={{
                visibility: event.visibility,
                invites: event.invitesEnabled,
                moments: event.momentsEnabled,
                tickets: event.ticketsEnabled,
              }}
              allowedVisibilities={[...rules.visibilities]}
              ticketsAllowed={rules.ticketsAllowed}
              themeColor={event.themeColor}
              coverUrl={coverUrl}
            />
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{ts('membersHeading')}</h3>
                  <p className="text-muted text-sm">{ts('membersBody')}</p>
                </div>
                <Link href={`/events/${id}/settings/members`} className={buttonClasses({ variant: 'secondary' })}>
                  {ts('membersAction')}
                </Link>
              </div>
            </Card>
          </>
        )}
      </div>
    </EventFrame>
  );
}
