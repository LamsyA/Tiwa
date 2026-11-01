import { listInbox, listMessages, requireParticipant } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ChatThread } from '@/components/chat/chat-thread.js';
import { requirePageUser } from '@/lib/ctx.js';
import { InboxLayout, parseFilter } from '../inbox-layout.js';

/** `/inbox/[threadId]`: one conversation (full screen on phones, right pane on desktop). */
export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { threadId } = await params;
  const { filter, q } = await searchParams;
  const ctx = await requirePageUser(`/inbox/${threadId}`);
  const t = await getTranslations('inbox');
  let mine: Awaited<ReturnType<typeof requireParticipant>>;
  try {
    mine = await requireParticipant(ctx.actor, threadId);
  } catch {
    notFound();
  }
  // The other party of a 1:1 thread, for Block (§9a.6).
  const other = await prisma.threadParticipant.findFirst({
    where: { threadId, leftAt: null, NOT: { id: mine.id }, thread: { kind: 'DIRECT' } },
    select: { userId: true, orgId: true },
  });
  const [initial, active, archived] = await Promise.all([
    listMessages(ctx.actor, threadId),
    listInbox(ctx.actor),
    listInbox(ctx.actor, { archived: true }),
  ]);
  const row = [...active, ...archived].find((candidate) => candidate.threadId === threadId);
  return (
    <InboxLayout ctx={ctx} filter={parseFilter(filter)} q={q} activeId={threadId}>
      <ChatThread
        key={threadId}
        me={ctx.actor.userId}
        header={{
          threadId,
          title: row?.title || (row?.kind === 'EVENT' ? t('team') : '…'),
          eventName: row?.eventName ?? null,
          isTeam: row?.kind === 'EVENT',
          muted: row?.muted ?? false,
          archived: row?.archived ?? false,
          blockTarget: other ? (other.orgId ? { orgId: other.orgId } : { userId: other.userId as string }) : null,
          asOrgId: mine.orgId,
        }}
        initial={{
          messages: initial.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
          hasMore: initial.hasMore,
          seenUpTo: initial.seenUpTo?.toISOString() ?? null,
          deliveredUpTo: initial.deliveredUpTo?.toISOString() ?? null,
        }}
      />
    </InboxLayout>
  );
}
