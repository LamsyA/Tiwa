import { env } from '@tiwa/config';
import { authorize } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, Card } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { InvitesSwitch } from './invites-switch.js';
import { ShareSection } from './share-section.js';

/** P4-T05: invitations switch (off by default) + one-link Share section. Composer/tracking land in P4-T06/T07. */
export default async function InvitesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed, invitesOn } = await loadEventPage(id, '/invites', 'event.view');
  const t = await getTranslations('events.invites');
  if (!allowed) {
    const tf = await getTranslations('events');
    return (
      <EventFrame
        eventId={id}
        userId={ctx.actor.userId}
        access={access}
        invitesOn={invitesOn}
        active="invites"
        title={t('title')}
      >
        <Banner tone="warning">{tf('forbiddenBody')}</Banner>
      </EventFrame>
    );
  }
  const canManage = await (async () => {
    try {
      authorize(ctx.actor, 'guests.manage', { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  })();
  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    select: { name: true, slug: true, sharedLinkEnabled: true },
  });
  const shareUrl = `${env.APP_URL.replace(/\/$/, '')}/e/${event.slug}/rsvp`;

  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      active="invites"
      title={event.name}
    >
      <div className="flex flex-col gap-4 py-2">
        <h2 className="font-display text-xl font-bold">{t('title')}</h2>
        {!invitesOn && (
          <Card className="flex flex-col gap-3 p-4">
            <h3 className="font-medium">{t('off.title')}</h3>
            <p className="text-muted text-sm">{t('off.body')}</p>
            {canManage && <InvitesSwitch eventId={id} enabled={false} />}
          </Card>
        )}
        {invitesOn && canManage && (
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <p className="text-muted min-w-0 flex-1 text-sm">{t('off.body')}</p>
            <InvitesSwitch eventId={id} enabled />
          </Card>
        )}
        <ShareSection
          eventId={id}
          eventName={event.name}
          shareUrl={shareUrl}
          sharedOn={event.sharedLinkEnabled}
          canManage={canManage}
        />
      </div>
    </EventFrame>
  );
}
