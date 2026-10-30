import { authorize, countGuests, headcount, listGroups, listGuests, listTables } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { GuestsManager } from './guests-manager.js';

/** P4-T03 / UF-06: guest list with counters, search, filters, bulk actions; groups tab. */
export default async function GuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; group?: string; rsvp?: string; checkedIn?: string; tab?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { ctx, access, allowed, invitesOn } = await loadEventPage(id, '/guests', 'event.view');
  const t = await getTranslations('events.guests');
  if (!allowed) {
    const tf = await getTranslations('events');
    return (
      <EventFrame
        eventId={id}
        userId={ctx.actor.userId}
        access={access}
        invitesOn={invitesOn}
        active="guests"
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

  const rsvp =
    query.rsvp === 'YES' || query.rsvp === 'NO' || query.rsvp === 'MAYBE' || query.rsvp === 'NONE'
      ? query.rsvp
      : undefined;
  const [counts, listed, groups, tables, report, event] = await Promise.all([
    countGuests(ctx.actor, id, access),
    listGuests(
      ctx.actor,
      {
        eventId: id,
        ...(query.q ? { search: query.q } : {}),
        ...(query.group ? { groupId: query.group } : {}),
        ...(rsvp ? { rsvp } : {}),
        ...(query.checkedIn === 'yes' ? { checkedIn: true } : query.checkedIn === 'no' ? { checkedIn: false } : {}),
      },
      access,
    ),
    listGroups(ctx.actor, id, access),
    listTables(ctx.actor, id, access),
    canManage ? headcount(ctx.actor, id, access) : Promise.resolve(null),
    prisma.event.findUniqueOrThrow({ where: { id }, select: { name: true } }),
  ]);

  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      active="guests"
      title={event.name}
    >
      <GuestsManager
        eventId={id}
        canManage={canManage}
        counts={counts}
        guests={listed.guests}
        total={listed.total}
        redacted={listed.redacted}
        groups={groups}
        filters={{
          q: query.q ?? '',
          group: query.group ?? '',
          rsvp: query.rsvp ?? '',
          checkedIn: query.checkedIn ?? '',
        }}
        tab={query.tab === 'groups' || query.tab === 'tables' || query.tab === 'headcount' ? query.tab : 'list'}
        tables={tables}
        report={report}
      />
    </EventFrame>
  );
}
