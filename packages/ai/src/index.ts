import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { z } from 'zod';

// LLM adapters (arc.md §4 "LlmProvider", PRD AI-01; D-X31). Shapes match
// @tiwa/core's PlanDrafter structurally, so this package never imports core.
// `fake` is deterministic for tests and keyless local work; `anthropic` calls
// Claude through the official SDK with structured JSON output.

export interface PlanDraftContext {
  eventType: string;
  eventFormat: string;
  daysUntilEvent: number | null;
  expectedGuests: number | null;
  budget: { amount: string; currency: string } | null;
  existingTasks: string[];
  request: string;
}

export interface PlanDraftSuggestion {
  title: string;
  daysBefore: number | null;
  why: string;
}

export interface PlanDrafter {
  draftTasks(context: PlanDraftContext): Promise<PlanDraftSuggestion[]>;
}

const suggestionsSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string(),
        daysBefore: z.number().nullable(),
        why: z.string(),
      }),
    )
    .max(25),
});

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short, actionable task, max 80 characters, imperative mood.' },
          daysBefore: {
            type: ['integer', 'null'],
            description: 'Days before the event it should be done; 0 = on the day; null if timing does not matter.',
          },
          why: { type: 'string', description: 'One short sentence on why it matters for this event.' },
        },
        required: ['title', 'daysBefore', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
} as const;

/** Prompt v1. Versioned so changes show up in review and logs. */
export const PLAN_PROMPT_VERSION = 'plan-draft@1';
const SYSTEM = [
  'You help people plan their own events (birthdays, weddings, funerals, church programmes, reunions, corporate events, concerts and more) without a professional planner.',
  "Turn the host's request into a practical checklist of 6 to 20 tasks that fits their event, timing, guest count and budget.",
  'Respect what they ask for and skip anything they say they do not want. Do not repeat tasks they already have.',
  'Be specific to their request, not generic. Order tasks from earliest to latest.',
  'Never include personal data, prices you were not given, or vendor names.',
].join(' ');

function describe(context: PlanDraftContext): string {
  const lines = [
    `Event type: ${context.eventType} (${context.eventFormat.toLowerCase().replace(/_/g, ' ')})`,
    context.daysUntilEvent !== null ? `Days until the event: ${context.daysUntilEvent}` : 'Date: not set yet',
    context.expectedGuests ? `Expected guests: ${context.expectedGuests}` : null,
    context.budget ? `Total budget: ${context.budget.amount} ${context.budget.currency}` : null,
    context.existingTasks.length > 0 ? `Tasks they already have:\n- ${context.existingTasks.join('\n- ')}` : null,
    `What they want help with:\n${context.request}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export class ClaudePlanDrafter implements PlanDrafter {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model = 'claude-opus-5-5',
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async draftTasks(context: PlanDraftContext): Promise<PlanDraftSuggestion[]> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      output_config: { effort: 'low', format: jsonSchemaOutputFormat(OUTPUT_SCHEMA) },
      system: SYSTEM,
      messages: [{ role: 'user', content: describe(context) }],
    });
    if (response.stop_reason === 'refusal') return [];
    const parsed = suggestionsSchema.safeParse(response.parsed_output);
    console.info(
      `[ai] ${PLAN_PROMPT_VERSION} model=${this.model} in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
    );
    return parsed.success ? parsed.data.tasks : [];
  }
}

/** Deterministic drafter: a sensible base list plus tasks keyed off words in the request. */
export class FakePlanDrafter implements PlanDrafter {
  async draftTasks(context: PlanDraftContext): Promise<PlanDraftSuggestion[]> {
    const request = context.request.toLowerCase();
    const tasks: PlanDraftSuggestion[] = [
      { title: 'Set the guest list', daysBefore: 60, why: 'Numbers drive the venue, food and budget.' },
      { title: 'Book the venue', daysBefore: 56, why: 'Good venues book out early.' },
      { title: 'Confirm food and drinks', daysBefore: 30, why: 'Caterers need a final count.' },
      { title: 'Send invitations', daysBefore: 28, why: 'Guests need time to plan.' },
      { title: 'Plan the order of the day', daysBefore: 7, why: 'Everyone knows what happens when.' },
      { title: 'Confirm every vendor', daysBefore: 3, why: 'Avoid surprises on the day.' },
    ];
    if (/(garden|outdoor|open)/.test(request)) {
      tasks.push({ title: 'Arrange canopies in case of rain', daysBefore: 14, why: 'Outdoor plans need a backup.' });
    }
    if (/(music|dj|dance|band)/.test(request)) {
      tasks.push({ title: 'Book the DJ or band', daysBefore: 45, why: 'Entertainment sets the mood.' });
    }
    if (/(photo|picture|video)/.test(request)) {
      tasks.push({ title: 'Book a photographer', daysBefore: 45, why: 'Capture the day properly.' });
    }
    if (/(cake|dessert)/.test(request)) {
      tasks.push({ title: 'Order the cake', daysBefore: 14, why: 'Custom cakes need lead time.' });
    }
    const existing = new Set(context.existingTasks.map((title) => title.toLowerCase()));
    return tasks.filter((task) => !existing.has(task.title.toLowerCase()));
  }
}

/** Picks the drafter from env (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL_DRAFT`). */
export function planDrafterFromEnv(env: {
  LLM_PROVIDER?: string | undefined;
  LLM_API_KEY?: string | undefined;
  LLM_MODEL_DRAFT?: string | undefined;
}): PlanDrafter {
  if (env.LLM_PROVIDER === 'anthropic' && env.LLM_API_KEY) {
    return new ClaudePlanDrafter(env.LLM_API_KEY, env.LLM_MODEL_DRAFT || 'claude-opus-5-5');
  }
  return new FakePlanDrafter();
}
