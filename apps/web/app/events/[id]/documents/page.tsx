import { authorize, listDocuments } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { getTranslations } from 'next-intl/server';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { DocumentsPanel } from './documents-panel.js';

/** EVT-08: per-event documents (PDF, images, Office files ≤ 25 MB). */
export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, invitesOn } = await loadEventPage(id, '/documents');
  const t = await getTranslations('events.documents');
  const [event, documents] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id }, select: { name: true } }),
    listDocuments(ctx.actor, id, access),
  ]);
  let canEdit = true;
  try {
    authorize(ctx.actor, 'event.edit', { eventId: id, access });
  } catch {
    canEdit = false;
  }
  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      active="documents"
      title={event.name}
    >
      <div className="flex flex-col gap-4 py-2">
        <h2 className="font-display text-xl font-bold">{t('heading')}</h2>
        <DocumentsPanel
          eventId={id}
          canEdit={canEdit}
          documents={documents.map((doc) => ({ ...doc, createdAt: doc.createdAt.toISOString() }))}
        />
      </div>
    </EventFrame>
  );
}
