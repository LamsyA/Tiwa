import { authorize, dayContacts, dayIncidents, runOfShow } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Card } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { DayEditor } from './day-editor.js';

/** `/events/[id]/day` run-of-show (P12-T02): timeline editor for the team.
 * Late flow, live updates and vendor views arrive in P12-T03/T04. */
export default async function DayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(id, '/day', 'event.view');
  const t = await getTranslations('day');
  if (!allowed) {
    return (
      <EventFrame
        eventId={id}
        userId={ctx.actor.userId}
        access={access}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
        active="day"
        title={t('title')}
      >
        <Forbidden eventId={id} />
      </EventFrame>
    );
  }
  const canManage = await (async () => {
    try {
      authorize(ctx.actor, 'runofshow.edit', { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  })();
  const [day, incidents, contacts] = await Promise.all([
    runOfShow(ctx.actor, id).catch(() => null),
    dayIncidents(ctx.actor, id).catch(() => null),
    dayContacts(ctx.actor, id).catch(() => null),
  ]);
  const [participants, orgs] = await Promise.all([
    prisma.eventParticipant.findMany({
      where: { eventId: id, removedAt: null, userId: { not: null } },
      select: { userId: true, orgId: true },
    }),
    prisma.organization.findMany({
      where: {
        id: {
          in: (await prisma.booking.findMany({ where: { eventId: id }, select: { vendorOrgId: true } })).map(
            (row) => row.vendorOrgId,
          ),
        },
      },
      select: { id: true, name: true },
    }),
  ]);
  const memberUserIds = [...new Set(participants.map((row) => row.userId as string))];
  const memberOrgIds = [
    ...new Set(participants.map((row) => row.orgId).filter((rowId): rowId is string => rowId !== null)),
  ];
  const [memberUsers, memberOrgs] = await Promise.all([
    memberUserIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: memberUserIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    memberOrgIds.length > 0
      ? prisma.organization.findMany({ where: { id: { in: memberOrgIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const owners = [
    ...memberUsers.map((row) => ({ id: row.id, name: row.name, kind: 'user' as const })),
    ...memberOrgs.map((row) => ({ id: row.id, name: row.name, kind: 'org' as const })),
    ...orgs
      .filter((row) => !memberOrgIds.includes(row.id))
      .map((row) => ({ id: row.id, name: row.name, kind: 'org' as const })),
  ];
  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
      active="day"
      title={t('title')}
    >
      <div className="flex flex-col gap-4 py-2">
        <h2 className="font-display text-xl font-bold">{t('timeline')}</h2>
        {!day ? (
          <Card className="p-4">
            <p className="text-muted text-sm">{t('noItems')}</p>
          </Card>
        ) : (
          <DayEditor
            eventId={id}
            canManage={canManage}
            myUserId={ctx.actor.userId}
            myOrgIds={memberOrgIds}
            items={day.items.map((row) => ({ ...row, status: row.status, startsAt: row.startsAt.toISOString() }))}
            dependencies={day.dependencies}
            owners={owners}
            checkins={day.checkins.map((row) => ({ ...row, at: row.at.toISOString() }))}
            incidents={(incidents?.incidents ?? []).map((row) => ({
              ...row,
              resolvedAt: row.resolvedAt?.toISOString() ?? null,
              createdAt: row.createdAt.toISOString(),
            }))}
            contacts={contacts?.contacts ?? []}
            onsiteVendors={contacts?.onsiteVendors ?? []}
          />
        )}
      </div>
    </EventFrame>
  );
}
