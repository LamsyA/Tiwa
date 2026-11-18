import { env } from '@tiwa/config';
import { authorize, getProgramme } from '@tiwa/core';
import { getTranslations } from 'next-intl/server';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { ProgrammeEditor } from './programme-editor.js';

/** D-X92: the host builds the guest programme — speeches, prayers, music, the meal, anything. */
export default async function ProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(id, '/programme', 'event.view');
  const t = await getTranslations('programme');
  const frame = { eventId: id, userId: ctx.actor.userId, access, invitesOn, momentsOn, ticketsOn };
  if (!allowed) {
    return (
      <EventFrame {...frame} active="programme" title={t('title')}>
        <Forbidden eventId={id} />
      </EventFrame>
    );
  }
  const canEdit = (() => {
    try {
      authorize(ctx.actor, 'event.edit', { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  })();
  const view = await getProgramme(ctx.actor, id);
  const guestUrl = `${env.APP_URL.replace(/\/$/, '')}/e/${view.event.slug}/agenda`;
  return (
    <EventFrame {...frame} active="programme" title={view.event.name}>
      <ProgrammeEditor
        eventId={id}
        eventName={view.event.name}
        isDraft={view.event.status === 'DRAFT'}
        days={view.days}
        items={view.items}
        guestUrl={guestUrl}
        canEdit={canEdit}
      />
    </EventFrame>
  );
}
