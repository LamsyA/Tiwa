import { describe, expect, it } from 'vitest';
import { FakePlanDrafter, MusePlanDrafter, planDrafterFromEnv } from './index.js';

const context = {
  eventType: 'Birthday',
  eventFormat: 'PRIVATE_CELEBRATION',
  daysUntilEvent: 90,
  expectedGuests: 60,
  budget: null,
  existingTasks: ['Book the venue'],
  request: 'Outdoor garden party with a DJ and a big cake',
};

describe('FakePlanDrafter', () => {
  it('adds request-specific tasks and skips ones the host already has', async () => {
    const tasks = await new FakePlanDrafter().draftTasks(context);
    const titles = tasks.map((task) => task.title);
    expect(titles).toContain('Arrange canopies in case of rain');
    expect(titles).toContain('Book the DJ or band');
    expect(titles).toContain('Order the cake');
    expect(titles).not.toContain('Book the venue');
  });

  it('falls back to the fake without a provider key', () => {
    expect(planDrafterFromEnv({ LLM_PROVIDER: 'anthropic' })).toBeInstanceOf(FakePlanDrafter);
    expect(planDrafterFromEnv({})).toBeInstanceOf(FakePlanDrafter);
  });

  it('uses Meta Muse when TIWA_MUSE_API is set', () => {
    expect(planDrafterFromEnv({ TIWA_MUSE_API: 'k' })).toBeInstanceOf(MusePlanDrafter);
  });
});

describe('MusePlanDrafter', () => {
  it('posts JSON-mode chat completions and parses the tasks', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: '{"tasks":[{"title":"Book a DJ","daysBefore":30,"why":"Sets the mood."}]}' } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const tasks = await new MusePlanDrafter('key').draftTasks(context);
      expect(tasks).toEqual([{ title: 'Book a DJ', daysBefore: 30, why: 'Sets the mood.' }]);
      expect(calls[0]?.url).toBe('https://api.meta.ai/v1/chat/completions');
      expect(calls[0]?.body).toMatchObject({
        model: 'muse-spark-1.3-contributor',
        response_format: { type: 'json_object' },
      });
    } finally {
      globalThis.fetch = original;
    }
  });
});
