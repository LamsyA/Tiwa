import { describe, expect, it } from 'vitest';
import { MemoryOutboxStore, flushOutbox, type PendingMessage, type SendOutcome } from './chat-outbox.js';

const msg = (id: string, threadId: string, createdAt: number): PendingMessage => ({
  clientMessageId: id,
  threadId,
  body: id,
  createdAt,
  attempts: 0,
});

describe('chat outbox (optimistic send + offline retry)', () => {
  it('sends in order and empties the queue', async () => {
    const store = new MemoryOutboxStore();
    await store.put(msg('b', 't1', 2));
    await store.put(msg('a', 't1', 1));
    const order: string[] = [];
    const result = await flushOutbox(store, async (m) => {
      order.push(m.clientMessageId);
      return 'sent';
    });
    expect(order).toEqual(['a', 'b']);
    expect(result).toEqual({ sent: 2, pending: 0 });
  });

  it('a retryable failure stalls only that thread, keeps order, and counts attempts', async () => {
    const store = new MemoryOutboxStore();
    await store.put(msg('a1', 'A', 1));
    await store.put(msg('a2', 'A', 2));
    await store.put(msg('b1', 'B', 3));
    const outcomes: Record<string, SendOutcome> = { a1: 'retry', a2: 'sent', b1: 'sent' };
    const tried: string[] = [];
    const result = await flushOutbox(store, async (m) => {
      tried.push(m.clientMessageId);
      return outcomes[m.clientMessageId] ?? 'retry';
    });
    expect(tried).toEqual(['a1', 'b1']); // a2 waits behind a1
    expect(result).toEqual({ sent: 1, pending: 2 });
    expect((await store.all()).find((m) => m.clientMessageId === 'a1')?.attempts).toBe(1);
  });

  it('network errors count as retry; refusals are dropped and reported', async () => {
    const store = new MemoryOutboxStore();
    await store.put(msg('x', 'T', 1));
    await store.put(msg('y', 'U', 2));
    const rejected: string[] = [];
    await flushOutbox(
      store,
      async (m) => {
        if (m.clientMessageId === 'x') throw new Error('offline');
        return 'rejected';
      },
      (m) => rejected.push(m.clientMessageId),
    );
    expect(rejected).toEqual(['y']);
    expect((await store.all()).map((m) => m.clientMessageId)).toEqual(['x']);
  });
});
