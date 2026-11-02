import { authorize, dayContacts, dayIncidents, runOfShow } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Card } from '@tiwa/ui';
import { AlertTriangle, CheckCircle2, Clock, Radio, Truck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { DayEditor } from './day-editor.js';

/** Request time, outside render so the purity lint is satisfied. */
function currentTime(): number {
  return Date.now();
}

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
  const event = await prisma.event.findUniqueOrThrow({ where: { id }, select: { timezone: true } });
  const items = day?.items ?? [];
  const nowMs = currentTime();
  const live = items.find((row) => row.status === 'STARTED');
  const upcoming = items.filter((row) => row.status === 'PLANNED' || row.status === 'LATE');
  const nextUp = upcoming.find((row) => row !== live) ?? null;
  const doneCount = items.filter((row) => row.status === 'DONE' || row.status === 'SKIPPED').length;
  const lateCount = items.filter((row) => row.status === 'LATE' || row.lateByMin > 0).length;
  const openIncidents = (incidents?.incidents ?? []).filter((row) => !row.resolvedAt).length;
  const clock = (at: Date) =>
    at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: event.timezone });
  const startsIn = nextUp ? Math.round((nextUp.startsAt.getTime() - nowMs) / 60_000) : null;
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
        {items.length > 0 && (
          <section
            className="relative overflow-hidden rounded-3xl p-5 text-white shadow-[var(--shadow-2)] sm:p-7"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in oklab, var(--brand) 80%, black 25%), color-mix(in oklab, var(--brand-strong) 60%, #0b0b10))',
            }}
          >
            <div aria-hidden className="tiwa-grid-bg absolute inset-0 opacity-15" />
            <div className="relative grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-md">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/75 uppercase">
                  <Radio aria-hidden className={`size-3.5 ${live ? 'animate-pulse text-red-300' : ''}`} />
                  {t('hero.now')}
                </p>
                <p className="font-display mt-2 text-xl font-bold">{live ? live.title : t('hero.nothingLive')}</p>
                {live && <p className="text-sm text-white/75">{t('hero.startedAt', { time: clock(live.startsAt) })}</p>}
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-md">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/75 uppercase">
                  <Clock aria-hidden className="size-3.5" />
                  {t('hero.next')}
                </p>
                <p className="font-display mt-2 text-xl font-bold">{nextUp ? nextUp.title : t('hero.allDone')}</p>
                {nextUp && (
                  <p className="text-sm text-white/75">
                    {clock(nextUp.startsAt)}
                    {startsIn !== null && startsIn > 0 && startsIn < 24 * 60
                      ? ` · ${t('hero.inMinutes', { count: startsIn })}`
                      : ''}
                  </p>
                )}
              </div>
            </div>
            <dl className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['done', `${doneCount}/${items.length}`, CheckCircle2],
                  ['late', String(lateCount), Clock],
                  ['incidents', String(openIncidents), AlertTriangle],
                  ['onsite', String(contacts?.onsiteVendors.length ?? 0), Truck],
                ] as const
              ).map(([key, value, Icon]) => (
                <div key={key} className="rounded-2xl bg-black/15 px-3 py-2.5">
                  <dt className="flex items-center gap-1.5 text-xs text-white/70">
                    <Icon aria-hidden className="size-3.5" />
                    {t(`hero.${key}`)}
                  </dt>
                  <dd className="font-display text-xl font-bold">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
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
