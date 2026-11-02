import { describe, expect, it } from 'vitest';
import { FakePlanDrafter, planDrafterFromEnv } from './index.js';

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
});
