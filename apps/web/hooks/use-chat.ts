'use client';

import * as React from 'react';
import { sendChatMessage } from '@/app/inbox/actions.js';
import type { ChatEvent } from '@/lib/chat-live.js';
import {
  defaultOutboxStore,
  flushOutbox,
  newClientMessageId,
  type OutboxStore,
  type PendingAttachment,
  type PendingMessage,
} from '@/lib/chat-outbox.js';

const EVENT_TYPES: ChatEvent['type'][] = ['message', 'updated', 'receipt', 'typing'];

const POLL_MS = 10_000;

/**
 * One inbox stream per tab (`/api/sse/inbox`). `onEvent` gets every chat
 * event; `onReconnect` fires after the stream recovers so callers refetch
 * whatever they may have missed. If the stream can't be held open (no
 * EventSource, Redis asleep or down, a proxy), `onReconnect` runs every 10 s
 * instead, so chat keeps working by polling (D-X20).
 */
export function useInboxStream(onEvent: (event: ChatEvent) => void, onReconnect: () => void): void {
  const handlers = React.useRef({ onEvent, onReconnect });
  React.useEffect(() => {
    handlers.current = { onEvent, onReconnect };
  }, [onEvent, onReconnect]);

  React.useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      poll ??= setInterval(() => {
        if (document.visibilityState === 'visible') handlers.current.onReconnect();
      }, POLL_MS);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    if (typeof EventSource === 'undefined') {
      startPolling();
      return stopPolling;
    }
    const source = new EventSource('/api/sse/inbox', { withCredentials: true });
    // Every `ready` (the first one too) refetches: anything published between the
    // page render and the subscription would otherwise be missed.
    source.addEventListener('ready', () => {
      stopPolling();
      handlers.current.onReconnect();
    });
    // EventSource retries by itself; poll until it reports ready again.
    source.onerror = () => startPolling();
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (raw) => {
        try {
          handlers.current.onEvent(JSON.parse((raw as MessageEvent<string>).data) as ChatEvent);
        } catch {
          // ignore malformed events
        }
      });
    }
    return () => {
      source.close();
      stopPolling();
    };
  }, []);
}

/** Codes that mean "never going to work" — drop instead of retrying. */
const REFUSED = new Set(['FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'UNAUTHENTICATED', 'CONFLICT']);

/**
 * Optimistic sending with an offline queue (§9a.2). `send` shows the message
 * at once; `pending` lists what's still waiting (clock icon). Flushes on
 * mount, when the browser comes back online, and every 10 s while anything waits.
 */
export function useChatSender(onRejected: (message: PendingMessage) => void) {
  const store = React.useRef<OutboxStore | null>(null);
  const [pending, setPending] = React.useState<PendingMessage[]>([]);
  const rejectRef = React.useRef(onRejected);
  React.useEffect(() => {
    rejectRef.current = onRejected;
  }, [onRejected]);

  const flush = React.useCallback(async () => {
    store.current ??= defaultOutboxStore();
    await flushOutbox(
      store.current,
      async (message) => {
        // Waiting for the user's answer to the contact warning: don't ask the server again.
        if (message.needsContactAck && !message.acknowledgeContactWarning) return 'hold';
        const result = await sendChatMessage({
          threadId: message.threadId,
          clientMessageId: message.clientMessageId,
          ...(message.body ? { body: message.body } : {}),
          ...(message.attachments?.length ? { attachments: message.attachments } : {}),
          ...(message.replyToId ? { replyToId: message.replyToId } : {}),
          ...(message.acknowledgeContactWarning ? { acknowledgeContactWarning: true } : {}),
        });
        if (result.ok) return 'sent';
        if (result.fieldErrors?.body?.includes('contactWarning')) return 'hold';
        return REFUSED.has(result.code) ? 'rejected' : 'retry';
      },
      (message) => rejectRef.current(message),
    );
    setPending(await store.current.all());
  }, []);

  React.useEffect(() => {
    void flush();
    const online = () => void flush();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [flush]);

  React.useEffect(() => {
    if (pending.length === 0) return;
    const timer = setInterval(() => void flush(), 10_000);
    return () => clearInterval(timer);
  }, [pending.length, flush]);

  const send = React.useCallback(
    async (threadId: string, body: string, attachments: PendingAttachment[] = [], replyToId?: string) => {
      store.current ??= defaultOutboxStore();
      const message: PendingMessage = {
        clientMessageId: newClientMessageId(),
        threadId,
        body,
        ...(attachments.length ? { attachments } : {}),
        ...(replyToId ? { replyToId } : {}),
        createdAt: Date.now(),
        attempts: 0,
      };
      await store.current.put(message);
      setPending(await store.current.all());
      await flush();
      return message.clientMessageId;
    },
    [flush],
  );

  /** "Send anyway" for a held message (§9a.3). */
  const acknowledge = React.useCallback(
    async (clientMessageId: string) => {
      store.current ??= defaultOutboxStore();
      const message = (await store.current.all()).find((m) => m.clientMessageId === clientMessageId);
      if (!message) return;
      await store.current.put({ ...message, acknowledgeContactWarning: true });
      await flush();
    },
    [flush],
  );

  /** Drop a held message instead of sending it. */
  const discard = React.useCallback(async (clientMessageId: string) => {
    store.current ??= defaultOutboxStore();
    await store.current.remove(clientMessageId);
    setPending(await store.current.all());
  }, []);

  return { send, pending, flush, acknowledge, discard };
}
