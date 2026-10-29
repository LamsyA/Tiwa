import { authorize, listParticipants, listTasks } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { getTranslations } from 'next-intl/server';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { PlanBoard } from './plan-board.js';

/** UF-05: tasks grouped by timeframe, filters, detail sheet, inline add, live updates. */
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access } = await loadEventPage(id, '/plan');
  const t = await getTranslations('events.plan');
  const [event, tasks, members] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id }, select: { name: true, timezone: true } }),
    listTasks(ctx.actor, id),
    listParticipants(ctx.actor, id),
  ]);
  let canEdit = true;
  try {
    authorize(ctx.actor, 'event.edit', { eventId: id, access });
  } catch {
    canEdit = false;
  }

  return (
    <EventFrame eventId={id} userId={ctx.actor.userId} access={access} active="plan" title={event.name}>
      <h2 className="sr-only">{t('heading')}</h2>
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
