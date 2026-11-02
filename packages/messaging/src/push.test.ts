import { describe, expect, it } from 'vitest';
import { FakePush } from './push.js';

describe('FakePush (P13-T03)', () => {
  it('records sends for tests', async () => {
    const push = new FakePush();
    const result = await push.send({
      subscription: { endpoint: 'https://push.example/sub', keys: { p256dh: 'p', auth: 'a' } },
      title: 'Cake is ready',
      body: 'The cake arrived early',
      url: '/events/1/day',
    });
    expect(result.ok).toBe(true);
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]!.title).toBe('Cake is ready');
  });
});
