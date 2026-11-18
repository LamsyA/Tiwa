import { describe, expect, it } from 'vitest';
import {
  FakeAssistant,
  FakeBudgetDrafter,
  FakeMessageDrafter,
  FakePlanDrafter,
  MuseAssistant,
  assistantFromEnv,
  stripContacts,
  type Usage,
} from './index.js';

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

  it('falls back to the fakes without a Muse key, and never picks another provider', () => {
    expect(assistantFromEnv({})).toBeInstanceOf(FakeAssistant);
    expect(assistantFromEnv({ LLM_PROVIDER: 'anthropic', LLM_API_KEY: 'x' } as never)).toBeInstanceOf(FakeAssistant);
  });

  it('uses Meta Muse when TIWA_MUSE_API is set', () => {
    expect(assistantFromEnv({ TIWA_MUSE_API: 'k' })).toBeInstanceOf(MuseAssistant);
  });
});

describe('MuseAssistant', () => {
  it('posts JSON-mode chat completions, caps tokens, strips contacts and reports usage', async () => {
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
      const usage: Usage[] = [];
      const tasks = await new MuseAssistant('key', undefined, (row) => {
        usage.push(row);
      }).draftTasks({ ...context, request: 'Call me on 08031234567 or ada@example.com' });
      expect(usage).toEqual([
        expect.objectContaining({ feature: 'plan', inputTokens: 10, outputTokens: 20, promptVersion: 'plan-draft@4' }),
      ]);
      const sent = JSON.stringify(calls[0]?.body);
      expect(sent).not.toContain('08031234567');
      expect(sent).not.toContain('ada@example.com');
      expect(calls[0]?.body.max_tokens).toBe(8000);
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

describe('FakeMessageDrafter (D-X41)', () => {
  const base = {
    eventName: 'Tolu at 40',
    eventType: 'Birthday',
    whenText: 'Saturday, 14 November at 6:00 PM',
    venue: 'Eko Hotel',
    daysUntilEvent: 10,
    invitesSent: false,
    guestCounts: { total: 10, notReplied: 4, attending: 5, maybe: 1, declined: 0 },
    groups: ['Family'],
    language: 'en' as const,
    previous: null,
    style: null,
  };

  it('reads intent and audience from one prompt and keeps the placeholders', async () => {
    const drafter = new FakeMessageDrafter();
    const invite = await drafter.draftMessage({ ...base, prompt: 'Invite everyone' });
    expect(invite.kind).toBe('INVITE');
    expect(invite.audience).toBe('all');
    expect(invite.message).toContain('{name}');
    expect(invite.message).toContain('{link}');
    const remind = await drafter.draftMessage({ ...base, prompt: "Remind people who haven't replied" });
    expect(remind.kind).toBe('REMINDER');
    expect(remind.audience).toBe('not_replied');
    const family = await drafter.draftMessage({ ...base, prompt: 'Tell family the venue moved' });
    expect(family.audience).toBe('group');
    expect(family.groupName).toBe('Family');
  });
});

describe('FakeBudgetDrafter', () => {
  it('splits 100% across the given categories only', async () => {
    const split = await new FakeBudgetDrafter().draftBudget({
      eventType: 'Wedding',
      eventFormat: 'PRIVATE_CELEBRATION',
      expectedGuests: 200,
      total: '5000000',
      currency: 'NGN',
      categories: [
        { key: 'venue', label: 'Venue' },
        { key: 'catering', label: 'Catering' },
        { key: 'misc', label: 'Other' },
      ],
      request: '',
    });
    expect(split.lines.map((line) => line.key)).toEqual(['venue', 'catering', 'misc']);
    expect(split.lines.reduce((sum, line) => sum + line.percent, 0)).toBe(100);
  });

  it('stripContacts hides phones and emails', () => {
    expect(stripContacts('ring +234 803 123 4567 / a@b.co')).toBe('ring [phone] / [email]');
  });
});

describe('Tiwa-specific prompts (D-X94)', () => {
  it('every feature starts with the Tiwa briefing and points to Tiwa tabs', async () => {
    const { PLAN_SYSTEM, BUDGET_SYSTEM, COMPARE_SYSTEM, IMPACT_SYSTEM, MESSAGE_SYSTEM, TIWA_CONTEXT } =
      await import('./index.js');
    for (const system of [PLAN_SYSTEM, BUDGET_SYSTEM, COMPARE_SYSTEM, IMPACT_SYSTEM, MESSAGE_SYSTEM]) {
      expect(system.startsWith(TIWA_CONTEXT)).toBe(true);
    }
    expect(TIWA_CONTEXT).toContain('Programme tab');
    expect(TIWA_CONTEXT).toContain('Guest count changed');
    expect(PLAN_SYSTEM).toContain('daysBefore must be between 0 and the days until the event');
  });

  it("the plan request carries the event's real state", async () => {
    const { describePlan } = await import('./index.js');
    const text = describePlan({
      eventType: 'Wedding',
      eventFormat: 'PRIVATE_CELEBRATION',
      daysUntilEvent: 45,
      expectedGuests: 120,
      budget: { amount: '5000000', currency: 'NGN' },
      existingTasks: ['Book the venue'],
      request: 'Plan the rest',
      whenText: 'Saturday 14 March 2026, 16:00',
      venue: 'Eko Terrace, Lekki',
      booked: ['Venue'],
      inProgress: ['Catering'],
      guests: { invited: 80, attending: 50, notReplied: 30 },
      features: { invites: true, tickets: false, moments: true },
    });
    expect(text).toContain('Days until the event: 45');
    expect(text).toContain('Already booked: Venue');
    expect(text).toContain('Shortlisted or waiting on quotes (not booked yet): Catering');
    expect(text).toContain('80 invited, 50 attending, 30 not replied');
    expect(text).toContain('Switched on in Tiwa: invites, moments (photo gallery)');
  });
});
