import { env } from '@tiwa/config';
import { authorize, batchDeliveries, freeModeQueue, listBatches, listGroups, listGuests } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, Card } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { Composer } from './composer.js';
import { FreeQueue } from './free-queue.js';
import { InvitesSwitch } from './invites-switch.js';
import { PolicyToggles } from './policy-toggles.js';
import { ShareSection } from './share-section.js';
import { TrackingSection } from './tracking-table.js';

/** P4-T05–T07: invitations switch + Share section + composer + live tracking. */
export default async function InvitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ batch?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
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
    select: {
      name: true,
      slug: true,
      currency: true,
      sharedLinkEnabled: true,
      remindersEnabled: true,
      allowForwarding: true,
    },
  });
  const shareUrl = `${env.APP_URL.replace(/\/$/, '')}/e/${event.slug}/rsvp`;
  const [listed, groups, batches, queue] =
    invitesOn && canManage
      ? await Promise.all([
          listGuests(ctx.actor, { eventId: id, take: 500 }, access),
          listGroups(ctx.actor, id, access),
          listBatches(ctx.actor, { eventId: id }, access),
          freeModeQueue(ctx.actor, { eventId: id, appUrl: env.APP_URL }, access),
        ])
      : [{ guests: [], total: 0, redacted: false, nextCursor: null }, [], [], { items: [] }];
  const selectedBatch = query.batch ?? batches[0]?.id ?? null;
  const detail =
    invitesOn && canManage && selectedBatch ? await batchDeliveries(ctx.actor, { batchId: selectedBatch }) : null;

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
            <Composer
              eventId={id}
              eventName={event.name}
              currency={event.currency}
              appUrl={env.APP_URL.replace(/\/$/, '')}
              guests={listed.guests.map((guest) => ({ id: guest.id, name: guest.name }))}
              groups={groups}
            />
            <InvitesSwitch eventId={id} enabled />
          </Card>
        )}
        {invitesOn && canManage && queue.items.length > 0 && <FreeQueue items={queue.items} />}
        {invitesOn && canManage && (
          <PolicyToggles eventId={id} remindersOn={event.remindersEnabled} forwardingOn={event.allowForwarding} />
        )}
        {invitesOn && canManage && (
          <TrackingSection
            eventId={id}
            batches={batches}
            selectedId={selectedBatch}
            deliveries={detail?.deliveries ?? []}
          />
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
