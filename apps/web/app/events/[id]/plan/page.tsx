import { Users } from 'lucide-react';
import { authorize, listParticipants, listTasks } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { getTranslations } from 'next-intl/server';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { PlanBoard } from './plan-board.js';

/** UF-05: tasks grouped by timeframe, filters, detail sheet, inline add, live updates. */
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, invitesOn, momentsOn, ticketsOn } = await loadEventPage(id, '/plan');
  const t = await getTranslations('events.plan');
  const [event, tasks, members] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id }, select: { name: true, timezone: true } }),
    listTasks(ctx.actor, id, access),
    listParticipants(ctx.actor, id, access),
  ]);
  let canEdit = true;
  try {
    authorize(ctx.actor, 'event.edit', { eventId: id, access });
  } catch {
    canEdit = false;
  }

  // D-X71: once a planner is hired, the host still owns the plan and works on it with them.
  const plannerRow =
    access?.role === 'HOST' || access?.role === 'CO_HOST'
      ? await prisma.eventParticipant.findFirst({
          where: { eventId: id, role: 'PLANNER', removedAt: null, orgId: { not: null } },
          select: { orgId: true },
        })
      : null;
  const plannerName = plannerRow?.orgId
    ? ((await prisma.organization.findUnique({ where: { id: plannerRow.orgId }, select: { name: true } }))?.name ??
      null)
    : null;
  const tp = await getTranslations('events.plan');
  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
      active="plan"
      title={event.name}
    >
      <h2 className="sr-only">{t('heading')}</h2>
      {plannerName && (
        <div className="border-teal/25 bg-teal-soft/70 mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3">
          <Users aria-hidden className="text-teal-strong mt-0.5 size-4 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold">{tp('plannerNoteTitle', { planner: plannerName })}</span>{' '}
            <span className="text-muted">{tp('plannerNoteBody', { planner: plannerName })}</span>
          </p>
        </div>
      )}
      <PlanBoard
        eventId={id}
        me={ctx.actor.userId}
        timezone={event.timezone}
        canEdit={canEdit}
        tasks={tasks.map((task) => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null }))}
        members={members.members
          .filter((member) => member.userId)
          .map((member) => ({ userId: member.userId as string, name: member.name }))}
      />
    </EventFrame>
  );
}
