import { env } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { Redis } from 'ioredis';

// Real-time chat (Backend.md §9a.2, P6-T13). Channels `inbox:user:{id}` and
// `inbox:org:{id}`; one SSE stream per user subscribes to their own channel
// plus each business they belong to. Events carry ids and small fields only —
// clients fetch message bodies through permission-checked reads.
//
// One shared subscriber connection per server process fans out to every open
// stream (ref-counted channels), so 1,000 streams ≠ 1,000 Redis connections.

export type ChatEvent =
  | { type: 'message'; threadId: string; messageId: string; authorUserId: string; at: number }
  | { type: 'updated'; threadId: string; messageId: string; at: number }
  | { type: 'receipt'; threadId: string; kind: 'read' | 'delivered'; upTo: string; byUserId: string; at: number }
  | { type: 'typing'; threadId: string; userId: string; name: string | null; at: number };

export const userChannel = (userId: string) => `inbox:user:${userId}`;
export const orgChannel = (orgId: string) => `inbox:org:${orgId}`;

type Listener = (event: ChatEvent) => void;

interface Hub {
  publisher: Redis;
  subscriber: Redis;
  listeners: Map<string, Set<Listener>>;
}

const globalHub = globalThis as unknown as { __tiwaChatHub?: Hub };

function hub(): Hub {
  if (!globalHub.__tiwaChatHub) {
    const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
    const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    // Best-effort: clients re-sync on reconnect and poll as a backstop.
    publisher.on('error', () => undefined);
    subscriber.on('error', () => undefined);
    const listeners = new Map<string, Set<Listener>>();
    subscriber.on('message', (channel, raw) => {
      const set = listeners.get(channel);
      if (!set?.size) return;
      let event: ChatEvent;
      try {
        event = JSON.parse(raw) as ChatEvent;
      } catch {
        return;
      }
      for (const listener of set) listener(event);
    });
    globalHub.__tiwaChatHub = { publisher, subscriber, listeners };
  }
  return globalHub.__tiwaChatHub;
}

/** Subscribe one stream to several channels; returns an idempotent unsubscribe. */
export async function subscribeChat(channels: string[], listener: Listener): Promise<() => Promise<void>> {
  const { subscriber, listeners } = hub();
  const fresh: string[] = [];
  for (const channel of channels) {
    let set = listeners.get(channel);
    if (!set) {
      set = new Set();
      listeners.set(channel, set);
      fresh.push(channel);
    }
    set.add(listener);
  }
  if (fresh.length) await subscriber.subscribe(...fresh);
  let done = false;
  return async () => {
    if (done) return;
    done = true;
    const empty: string[] = [];
    for (const channel of channels) {
      const set = listeners.get(channel);
      set?.delete(listener);
      if (set && set.size === 0) {
        listeners.delete(channel);
        empty.push(channel);
      }
    }
    if (empty.length) await subscriber.unsubscribe(...empty).catch(() => undefined);
  };
}

/** Channels for every active participant of a thread (people and businesses). */
async function threadChannels(threadId: string, exceptUserId?: string): Promise<string[]> {
  const rows = await prisma.threadParticipant.findMany({
    where: { threadId, leftAt: null },
    select: { userId: true, orgId: true },
  });
  return [
    ...new Set(
      rows
        .filter((row) => row.orgId || row.userId !== exceptUserId)
        .map((row) => (row.orgId ? orgChannel(row.orgId) : userChannel(row.userId as string))),
    ),
  ];
}

/** Fan a chat event out to everyone in the thread. Never throws: chat writes must not fail on Redis. */
export async function publishToThread(threadId: string, event: ChatEvent, options: { exceptUserId?: string } = {}) {
  try {
    const channels = await threadChannels(threadId, options.exceptUserId);
    const payload = JSON.stringify(event);
    const { publisher } = hub();
    await Promise.all(channels.map((channel) => publisher.publish(channel, payload)));
  } catch {
    // Lost events are recovered by the client's refetch on reconnect / poll.
  }
}

const TYPING_TTL_SEC = 5;

/** Typing is ephemeral (§9a.2): rate-limited by a 5 s Redis key, never stored. */
export async function publishTyping(threadId: string, userId: string, name: string | null): Promise<void> {
  try {
    const { publisher } = hub();
    const fresh = await publisher.set(`typing:${threadId}:${userId}`, '1', 'EX', TYPING_TTL_SEC, 'NX');
    if (fresh !== 'OK') return; // already announced within the last 5 s
    await publishToThread(
      threadId,
      { type: 'typing', threadId, userId, name, at: Date.now() },
      { exceptUserId: userId },
    );
  } catch {
    // ephemeral by design
  }
}
