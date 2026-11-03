import { env } from '@tiwa/config';
import { authorize, countGuests, headcount, listGroups, listGuests, listTables } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { aiAllowed } from '@/lib/ai.js';
import { GuestImpact } from './guest-impact.js';
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
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(id, '/guests', 'event.view');
  const t = await getTranslations('events.guests');
  if (!allowed) {
    const tf = await getTranslations('events');
    return (
      <EventFrame
        eventId={id}
        userId={ctx.actor.userId}
        access={access}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
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

  const rsvp = (['YES', 'NO', 'MAYBE', 'NONE'] as const).find((candidate) => query.rsvp === candidate);
  // Per-tab fetching: only load the data the open tab renders. Counts and
  // groups always load (they feed the header counters, group filter and the
  // add-guest dialog); the 500-row guest list only on list/tables, tables
  // only on tables, the aggregate report only on headcount.
  const tab = query.tab === 'groups' || query.tab === 'tables' || query.tab === 'headcount' ? query.tab : 'list';
  const listFilter = {
    eventId: id,
    ...(query.q ? { search: query.q } : {}),
    ...(query.group ? { groupId: query.group } : {}),
    ...(rsvp ? { rsvp } : {}),
    ...(query.checkedIn === 'yes' ? { checkedIn: true } : query.checkedIn === 'no' ? { checkedIn: false } : {}),
  };
  const [counts, groups, event, listed, tables, report] = await Promise.all([
    countGuests(ctx.actor, id, access),
    listGroups(ctx.actor, id, access),
    prisma.event.findUniqueOrThrow({ where: { id }, select: { name: true, expectedGuests: true } }),
    tab === 'list' || tab === 'tables' ? listGuests(ctx.actor, listFilter, access) : Promise.resolve(null),
    tab === 'tables' ? listTables(ctx.actor, id, access) : Promise.resolve(null),
    tab === 'headcount' && canManage ? headcount(ctx.actor, id, access) : Promise.resolve(null),
  ]);
  const guests = listed?.guests ?? [];
  const impactOn = await aiAllowed(ctx.actor, id, access, 'ai.draftPlan');

  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
      active="guests"
      title={event.name}
    >
      {impactOn && (
        <div className="flex justify-end pt-2">
          <GuestImpact eventId={id} current={event.expectedGuests ?? 0} />
        </div>
      )}
      <GuestsManager
        eventId={id}
        canManage={canManage}
        counts={counts}
        guests={guests}
        total={listed?.total ?? 0}
        redacted={listed?.redacted ?? false}
        groups={groups}
        filters={{
          q: query.q ?? '',
          group: query.group ?? '',
          rsvp: query.rsvp ?? '',
          checkedIn: query.checkedIn ?? '',
        }}
        tab={tab}
        tables={tables ?? []}
        report={report}
        appUrl={env.APP_URL.replace(/\/$/, '')}
      />
    </EventFrame>
  );
}
