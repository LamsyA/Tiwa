import { describe, expect, it } from 'vitest';
import { eventChannel, publishLive, subscribeLive, type LiveMessage } from './live.js';

describe('live pub/sub (Redis)', () => {
  it('delivers a published change to subscribers of that channel only', async () => {
    const channel = eventChannel(`test-${Date.now()}`);
    const other = eventChannel(`other-${Date.now()}`);
    const received: LiveMessage[] = [];
    const unsubscribe = await subscribeLive(channel, (message) => received.push(message));
    try {
      await publishLive(other, 'tasks');
      await publishLive(channel, 'tasks');
      await expect.poll(() => received.length, { timeout: 3000 }).toBe(1);
      expect(received[0]?.kind).toBe('tasks');
    } finally {
      await unsubscribe();
    }
  });
});
