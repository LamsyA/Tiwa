'use client';

import type { MessageView } from '@tiwa/core';
import { Banner, Button, DropdownMenu, ResponsiveDialog, Textarea } from '@tiwa/ui';
import { ArrowLeft, MoreVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  blockChatParty,
  reportChatMessage,
  startChatAttachment,
  archiveChat,
  deleteChatMessage,
  editChatMessage,
  loadChatMessages,
  markChatDecision,
  markChatDelivered,
  markChatRead,
  muteChat,
} from '@/app/inbox/actions.js';
import { useChatSender, useInboxStream } from '@/hooks/use-chat.js';
import type { PendingAttachment } from '@/lib/chat-outbox.js';
import { Composer } from './composer.js';
import { MessageBubble, type BubbleMessage, type BubbleStatus } from './message-bubble.js';

type Wire = Omit<MessageView, 'createdAt'> & { createdAt: string };

export interface ThreadHeader {
  threadId: string;
  title: string;
  eventName: string | null;
  isTeam: boolean;
  muted: boolean;
  archived: boolean;
  /** The other party of a 1:1 thread (null for team threads). */
  blockTarget: { userId: string } | { orgId: string } | null;
  /** Speaking for this business in the thread, if not myself. */
  asOrgId: string | null;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const TYPING_SHOW_MS = 5000;

const toWire = (m: MessageView): Wire => ({ ...m, createdAt: new Date(m.createdAt).toISOString() });

/** Conversation view (UF-30): live messages, receipts, typing, optimistic sending, edit/delete/decision. */
export function ChatThread({
  header,
  me,
  initial,
}: {
  header: ThreadHeader;
  me: string;
  initial: { messages: Wire[]; hasMore: boolean; seenUpTo: string | null; deliveredUpTo: string | null };
}) {
  const t = useTranslations('inbox');
  const router = useRouter();
  const [messages, setMessages] = React.useState<Wire[]>(initial.messages); // newest first
  const [hasMore, setHasMore] = React.useState(initial.hasMore);
  const [seenUpTo, setSeenUpTo] = React.useState(initial.seenUpTo);
  const [deliveredUpTo, setDeliveredUpTo] = React.useState(initial.deliveredUpTo);
  const [typing, setTyping] = React.useState<{ name: string | null; until: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<{ id: string; body: string } | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const bottom = React.useRef<HTMLDivElement>(null);
  // "Now" for the 15-minute edit window; refreshed every 30 s.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const threadId = header.threadId;

  const { send, pending, acknowledge, discard } = useChatSender(React.useCallback(() => setError(t('rejected')), [t]));
  const mine = pending.filter((p) => p.threadId === threadId);
  const held = mine.find((p) => p.needsContactAck && !p.acknowledgeContactWarning);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [reporting, setReporting] = React.useState<{ id: string; reason: string } | null>(null);
  const [confirmBlock, setConfirmBlock] = React.useState(false);

  /** Re-read the newest page and merge (keeps older pages already loaded). */
  const refetch = React.useCallback(async () => {
    const result = await loadChatMessages({ threadId });
    if (!result.ok) return;
    const fresh = result.data.messages.map(toWire);
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      for (const m of fresh) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    setSeenUpTo(result.data.seenUpTo ? new Date(result.data.seenUpTo).toISOString() : null);
    setDeliveredUpTo(result.data.deliveredUpTo ? new Date(result.data.deliveredUpTo).toISOString() : null);
  }, [threadId]);

  useInboxStream(
    React.useCallback(
      (event) => {
        if (event.threadId !== threadId) return;
        if (event.type === 'typing') setTyping({ name: event.name, until: Date.now() + TYPING_SHOW_MS });
        else if (event.type === 'receipt') {
          if (event.kind === 'read') setSeenUpTo((current) => (current && current > event.upTo ? current : event.upTo));
          setDeliveredUpTo((current) => (current && current > event.upTo ? current : event.upTo));
        } else {
          if (event.type === 'message' && event.authorUserId !== me) setTyping(null);
          void refetch();
        }
      },
      [threadId, me, refetch],
    ),
    React.useCallback(() => void refetch(), [refetch]),
  );

  // Hide the typing hint after 5 s without a fresh signal.
  React.useEffect(() => {
    if (!typing) return;
    const timer = setTimeout(() => setTyping(null), Math.max(0, typing.until - Date.now()));
    return () => clearTimeout(timer);
  }, [typing]);

  // Newest message from someone else: report delivered + read (the thread is on screen).
  const newestOther = messages.find((m) => m.authorUserId !== me);
  React.useEffect(() => {
    if (!newestOther) return;
    void markChatDelivered({ threadId, upToMessageId: newestOther.id });
    if (document.visibilityState === 'visible') void markChatRead({ threadId, upToMessageId: newestOther.id });
  }, [newestOther, threadId]);

  // Stick to the bottom when messages arrive.
  React.useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, mine.length]);

  async function loadOlder() {
    const oldest = messages.at(-1);
    if (!oldest) return;
    const result = await loadChatMessages({ threadId, before: oldest.id });
    if (!result.ok) return;
    setMessages((current) => [...current, ...result.data.messages.map(toWire)]);
    setHasMore(result.data.hasMore);
  }

  async function onSend(body: string) {
    setError(null);
    await send(threadId, body);
    void refetch();
  }

  /** Upload each file straight to storage (D-A05), then send them as one message. */
  const [uploading, setUploading] = React.useState(0);
  const tFiles = useTranslations('inbox.attachmentErrors');
  async function onAttach(files: File[]) {
    setError(null);
    setUploading(files.length);
    const done: PendingAttachment[] = [];
    try {
      for (const file of files) {
        const mime = file.type || 'application/octet-stream';
        const started = await startChatAttachment({ threadId, mime, sizeBytes: file.size });
        if (!started.ok) {
          const key = Object.values(started.fieldErrors ?? {}).flat()[0];
          setError(tFiles(key && tFiles.has(key) ? key : 'generic', { name: file.name }));
          continue;
        }
        const put = await fetch(started.data.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': mime },
        }).catch(() => null);
        if (!put?.ok) {
          setError(tFiles('uploadFailed', { name: file.name }));
          continue;
        }
        done.push({ key: started.data.key, name: file.name, mime, sizeBytes: file.size });
      }
      if (done.length) {
        await send(threadId, '', done);
        void refetch();
      }
    } finally {
      setUploading(0);
    }
  }

  function statusOf(m: Wire): BubbleStatus {
    if (seenUpTo && m.createdAt <= seenUpTo) return 'seen';
    if (deliveredUpTo && m.createdAt <= deliveredUpTo) return 'delivered';
    return 'sent';
  }

  const serverClientIds = new Set(messages.map((m) => m.clientMessageId));
  const optimistic: (BubbleMessage & { status: BubbleStatus })[] = mine
    .filter((p) => !serverClientIds.has(p.clientMessageId))
    .map((p) => ({
      id: p.clientMessageId,
      body: p.body,
      mine: true,
      authorName: null,
      deleted: false,
      edited: false,
      masked: false,
      isDecision: false,
      createdAt: new Date(p.createdAt).toISOString(),
      ...(p.attachments ? { attachments: p.attachments } : {}),
      status: 'pending',
    }));
  const ordered = [...messages].reverse();

  return (
    <section aria-label={header.title} className="flex h-full min-h-0 flex-col">
      <header className="border-border flex items-center gap-2 border-b px-2 py-2">
        <Link
          href="/inbox"
          aria-label={t('back')}
          className="hover:bg-surface-2 flex size-11 items-center justify-center rounded-full lg:hidden"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{header.title}</h2>
          {header.eventName && !header.isTeam && (
            <p className="text-muted truncate text-xs">{t('about', { event: header.eventName })}</p>
          )}
          {typing && (
            <p className="text-brand-strong text-xs" role="status">
              {typing.name ? t('typing', { name: typing.name }) : t('someoneTyping')}
            </p>
          )}
        </div>
        <DropdownMenu
          align="end"
          trigger={
            <button
              type="button"
              aria-label={t('menu')}
              className="hover:bg-surface-2 flex size-11 items-center justify-center rounded-full"
            >
              <MoreVertical aria-hidden className="size-5" />
            </button>
          }
          items={[
            {
              label: header.muted ? t('unmute') : t('mute'),
              onSelect: () =>
                void muteChat({
                  threadId,
                  until: header.muted ? null : new Date(Date.now() + 365 * 86_400_000).toISOString(),
                }).then(() => router.refresh()),
            },
            ...(header.blockTarget ? [{ label: t('block'), onSelect: () => setConfirmBlock(true) }] : []),
            {
              label: header.archived ? t('unarchive') : t('archive'),
              onSelect: () =>
                void archiveChat({ threadId, archived: !header.archived }).then(() => router.push('/inbox')),
            },
          ]}
        />
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        {hasMore && (
          <div className="mb-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => void loadOlder()}>
              {t('loadOlder')}
            </Button>
          </div>
        )}
        {ordered.length === 0 && optimistic.length === 0 && <p className="text-muted text-center">{t('noMessages')}</p>}
        <ol className="flex flex-col gap-1.5">
          {ordered.map((m, index) => {
            const previous = ordered[index - 1];
            const canEdit = m.mine && !m.deleted && now - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;
            return (
              <li key={m.id}>
                <MessageBubble
                  message={m}
                  {...(m.mine ? { status: statusOf(m) } : {})}
                  showAuthor={!previous || previous.authorUserId !== m.authorUserId}
                  canEdit={canEdit}
                  canDecide={header.isTeam}
                  onEdit={() => setEditing({ id: m.id, body: m.body ?? '' })}
                  onDelete={() => setDeleting(m.id)}
                  onDecision={() => void markChatDecision({ messageId: m.id }).then(() => void refetch())}
                  {...(!m.mine && !m.deleted ? { onReport: () => setReporting({ id: m.id, reason: '' }) } : {})}
                  attachmentHref={(index, download) =>
                    `/api/chat/attachments/${m.id}/${index}${download ? '?download=1' : ''}`
                  }
                />
              </li>
            );
          })}
          {optimistic.map((m) => (
            <li key={m.id}>
              <MessageBubble message={m} status="pending" showAuthor={false} canEdit={false} canDecide={false} />
            </li>
          ))}
        </ol>
        <div ref={bottom} />
      </div>

      {notice && (
        <div className="px-3 pb-2">
          <Banner tone="info">{notice}</Banner>
        </div>
      )}
      {uploading > 0 && (
        <p role="status" className="text-muted px-3 pb-1 text-sm">
          {t('uploadingFiles', { count: uploading })}
        </p>
      )}
      {error && (
        <div className="px-3 pb-2">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
      {editing ? (
        <form
          className="border-border flex flex-col gap-2 border-t p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void editChatMessage({ messageId: editing.id, body: editing.body }).then((result) => {
              if (!result.ok) setError(t('errors.generic'));
              setEditing(null);
              void refetch();
            });
          }}
        >
          <Textarea
            aria-label={t('edit')}
            rows={2}
            value={editing.body}
            onChange={(event) => setEditing({ ...editing, body: event.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm">
              {t('save')}
            </Button>
          </div>
        </form>
      ) : (
        <Composer
          onSend={(body) => void onSend(body)}
          onAttach={(files) => void onAttach(files)}
          disabled={uploading > 0}
          onTyping={() =>
            void fetch('/api/chat/typing', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ threadId }),
            }).catch(() => undefined)
          }
        />
      )}
      {deleting && (
        <ResponsiveDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={t('deleteTitle')}
          description={t('deleteBody')}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const id = deleting;
                  setDeleting(null);
                  void deleteChatMessage({ messageId: id }).then(() => void refetch());
                }}
              >
                {t('delete')}
              </Button>
            </div>
          }
        >
          <span />
        </ResponsiveDialog>
      )}
      {held && (
        <ResponsiveDialog
          open
          onOpenChange={(open) => !open && void discard(held.clientMessageId)}
          title={t('contactWarningTitle')}
          description={t('contactWarningBody')}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => void discard(held.clientMessageId)}>
                {t('editMessage')}
              </Button>
              <Button onClick={() => void acknowledge(held.clientMessageId).then(() => void refetch())}>
                {t('sendAnyway')}
              </Button>
            </div>
          }
        >
          <p className="bg-surface-2 rounded-md p-3 text-sm">{held.body}</p>
        </ResponsiveDialog>
      )}
      {confirmBlock && header.blockTarget && (
        <ResponsiveDialog
          open
          onOpenChange={setConfirmBlock}
          title={t('blockTitle')}
          description={t('blockBody')}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmBlock(false)}>
                {t('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmBlock(false);
                  void blockChatParty({
                    ...header.blockTarget!,
                    ...(header.asOrgId ? { asOrgId: header.asOrgId } : {}),
                  }).then((result) => setNotice(result.ok ? t('blocked') : t('errors.generic')));
                }}
              >
                {t('block')}
              </Button>
            </div>
          }
        >
          <span />
        </ResponsiveDialog>
      )}
      {reporting && (
        <ResponsiveDialog
          open
          onOpenChange={(open) => !open && setReporting(null)}
          title={t('reportTitle')}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReporting(null)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  const { id, reason } = reporting;
                  void reportChatMessage({ messageId: id, reason }).then((result) => {
                    if (result.ok) {
                      setReporting(null);
                      setNotice(t('reportSent'));
                    } else setError(result.fieldErrors?.reason ? t('errors.reasonTooShort') : t('errors.generic'));
                  });
                }}
              >
                {t('report')}
              </Button>
            </div>
          }
        >
          <Textarea
            aria-label={t('reportReason')}
            placeholder={t('reportReason')}
            rows={3}
            value={reporting.reason}
            onChange={(event) => setReporting({ ...reporting, reason: event.target.value })}
          />
        </ResponsiveDialog>
      )}
    </section>
  );
}
