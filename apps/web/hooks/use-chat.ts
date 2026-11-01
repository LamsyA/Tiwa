'use client';

import * as React from 'react';
import { sendChatMessage } from '@/app/inbox/actions.js';
import type { ChatEvent } from '@/lib/chat-live.js';
import {
  defaultOutboxStore,
  flushOutbox,
  newClientMessageId,
  type OutboxStore,
  type PendingMessage,
} from '@/lib/chat-outbox.js';

const EVENT_TYPES: ChatEvent['type'][] = ['message', 'updated', 'receipt', 'typing'];

/**
 * One inbox stream per tab (`/api/sse/inbox`). `onEvent` gets every chat
 * event; `onReconnect` fires after the stream recovers so callers refetch
 * whatever they may have missed.
 */
export function useInboxStream(onEvent: (event: ChatEvent) => void, onReconnect: () => void): void {
  const handlers = React.useRef({ onEvent, onReconnect });
  React.useEffect(() => {
    handlers.current = { onEvent, onReconnect };
  }, [onEvent, onReconnect]);

  React.useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/sse/inbox', { withCredentials: true });
    let readyOnce = false;
    source.addEventListener('ready', () => {
      if (readyOnce) handlers.current.onReconnect();
      readyOnce = true;
    });
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (raw) => {
        try {
          handlers.current.onEvent(JSON.parse((raw as MessageEvent<string>).data) as ChatEvent);
        } catch {
          // ignore malformed events
        }
      });
    }
    return () => source.close();
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
        const result = await sendChatMessage({
          threadId: message.threadId,
          clientMessageId: message.clientMessageId,
          body: message.body,
        });
        if (result.ok) return 'sent';
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
    async (threadId: string, body: string) => {
      store.current ??= defaultOutboxStore();
      const message: PendingMessage = {
        clientMessageId: newClientMessageId(),
        threadId,
        body,
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

  return { send, pending, flush };
}
