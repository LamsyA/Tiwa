import { listParticipants } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { MembersManager } from './members-manager.js';

/** UF-04: add co-hosts, planners and planner staff with a permission preset; change or remove them. */
export default async function EventMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, invitesOn } = await loadEventPage(id, '/settings/members');
  const t = await getTranslations('events.members');
  const [event, list] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id }, select: { name: true, currency: true } }),
    listParticipants(ctx.actor, id, access),
  ]);
  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      active="settings"
      title={event.name}
    >
      <div className="flex flex-col gap-4 py-2">
        <Link href={`/events/${id}/settings`} className="text-brand-strong text-sm font-medium">
          {t('back')}
        </Link>
        <h2 className="font-display text-xl font-bold">{t('title')}</h2>
        <MembersManager
          eventId={id}
          me={ctx.actor.userId}
          currency={event.currency}
          canManage={list.canManage}
          members={list.members}
        />
      </div>
    </EventFrame>
  );
}
