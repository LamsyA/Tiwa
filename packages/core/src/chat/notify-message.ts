import { prisma } from '@tiwa/db';
import { notify } from '../messaging/notify.js';

// New-message notifications (D-X37). Every recipient gets a bell entry (and
// push, per their preferences) when a message lands, so a reply is never
// missed. One unread entry per conversation: further messages while it is
// still unread don't stack up. Muted conversations stay quiet. The preview
// uses the masked text, so contact details never leak through the bell.

const SYSTEM = { kind: 'system' } as const;
const PREVIEW_CHARS = 120;

export async function notifyNewMessage(messageId: string): Promise<{ notified: number }> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      threadId: true,
      authorUserId: true,
      authorOrgId: true,
      body: true,
      maskedBody: true,
      attachments: true,
      kind: true,
    },
  });
  if (!message || message.kind === 'CARD') return { notified: 0 };
  const now = new Date();
  const [participants, author, org] = await Promise.all([
    prisma.threadParticipant.findMany({
      where: { threadId: message.threadId, leftAt: null },
      select: { userId: true, orgId: true, mutedUntil: true },
    }),
    prisma.user.findUnique({ where: { id: message.authorUserId }, select: { name: true, phone: true } }),
    message.authorOrgId
      ? prisma.organization.findUnique({ where: { id: message.authorOrgId }, select: { name: true } })
      : Promise.resolve(null),
  ]);
  const listening = participants.filter((row) => !row.mutedUntil || row.mutedUntil < now);
  const orgIds = listening.map((row) => row.orgId).filter((id): id is string => id !== null);
  const members = orgIds.length
    ? await prisma.membership.findMany({ where: { orgId: { in: orgIds } }, select: { userId: true } })
    : [];
  const recipients = [
    ...new Set(
      [...listening.map((row) => row.userId), ...members.map((row) => row.userId)].filter(
        (id): id is string => id !== null && id !== message.authorUserId,
      ),
    ),
  ];
  if (recipients.length === 0) return { notified: 0 };

  const sender = org?.name ?? (author?.name && author.name !== author.phone ? author.name : null) ?? 'New message';
  const text = (message.maskedBody ?? message.body ?? '').trim();
  const preview =
    text.length > 0
      ? text.length > PREVIEW_CHARS
        ? `${text.slice(0, PREVIEW_CHARS - 1)}…`
        : text
      : (message.attachments as unknown[]).length > 0
        ? '📎 Attachment'
        : 'New message';
  const url = `/inbox/${message.threadId}`;

  // Already an unread bell entry for this conversation → don't stack another.
  const unread = await prisma.notification.findMany({
    where: { userId: { in: recipients }, type: 'chat.message', readAt: null, url },
    select: { userId: true },
  });
  const skip = new Set(unread.map((row) => row.userId));
  let notified = 0;
  for (const userId of recipients) {
    if (skip.has(userId)) continue;
    await notify(SYSTEM, {
      userId,
      type: 'chat.message',
      title: sender,
      body: preview,
      url,
      data: { threadId: message.threadId, messageId: message.id },
    });
    notified += 1;
  }
  return { notified };
}
