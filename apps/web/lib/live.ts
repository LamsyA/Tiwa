import { env } from '@tiwa/config';
import { Redis } from 'ioredis';

// Live updates (D-A06): Redis pub/sub fan-out, delivered to browsers over
// SSE (`/api/sse/event/{id}`). Messages carry ids and a change kind only —
// clients refetch through normal, permission-checked reads.

export interface LiveMessage {
  kind: 'tasks' | 'event' | 'members' | 'documents' | 'guests' | 'invites';
  at: number;
}

const globalLive = globalThis as unknown as { __tiwaLivePublisher?: Redis };

function publisher(): Redis {
  if (!globalLive.__tiwaLivePublisher) {
    const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
    // Publishing is best-effort: a Redis blip must never fail the user's write.
    client.on('error', () => undefined);
    globalLive.__tiwaLivePublisher = client;
  }
  return globalLive.__tiwaLivePublisher;
}

export const eventChannel = (eventId: string) => `event:${eventId}`;

/** Fire-and-forget: clients fall back to polling if a message is lost. */
export async function publishLive(channel: string, kind: LiveMessage['kind']): Promise<void> {
  const message: LiveMessage = { kind, at: Date.now() };
  await publisher()
    .publish(channel, JSON.stringify(message))
    .catch(() => undefined);
}

/** A dedicated subscriber connection per stream (pub/sub connections can't run other commands). */
export async function subscribeLive(
  channel: string,
  onMessage: (message: LiveMessage) => void,
): Promise<() => Promise<void>> {
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  subscriber.on('error', () => undefined);
  subscriber.on('message', (received, raw) => {
    if (received !== channel) return;
    try {
      onMessage(JSON.parse(raw) as LiveMessage);
    } catch {
      // Malformed messages are ignored; the client polls as a backstop.
    }
  });
  await subscriber.subscribe(channel);
  return async () => {
    await subscriber.unsubscribe(channel).catch(() => undefined);
    subscriber.disconnect();
  };
}
