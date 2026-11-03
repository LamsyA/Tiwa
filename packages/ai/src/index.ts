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
export const PLAN_PROMPT_VERSION = 'plan-draft@2';
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
    context.expectedGuests
      ? `Saved guest estimate (use the request instead if it gives a number): ${context.expectedGuests}`
      : null,
    context.budget
      ? `Saved total budget (use the request instead if it gives one): ${context.budget.amount} ${context.budget.currency}`
      : null,
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

const MUSE_BASE_URL = 'https://api.meta.ai/v1';

/**
 * Meta Muse Spark via the Meta Model API (OpenAI-compatible chat completions,
 * JSON mode). Default model `muse-spark-1.3-contributor` (D-X32). The model
 * reasons before answering, so the token limit leaves room for that and
 * effort is kept low for a quick checklist.
 */
export class MusePlanDrafter implements PlanDrafter {
  constructor(
    private readonly apiKey: string,
    private readonly model = 'muse-spark-1.3-contributor',
    private readonly baseUrl = MUSE_BASE_URL,
  ) {}

  async draftTasks(context: PlanDraftContext): Promise<PlanDraftSuggestion[]> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: this.model,
        reasoning_effort: 'low',
        max_tokens: 8000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${SYSTEM} Reply with JSON only, exactly this shape: {"tasks":[{"title":string,"daysBefore":integer|null,"why":string}]}. daysBefore = days before the event the task should be done (0 = on the day, null if timing does not matter).`,
          },
          { role: 'user', content: describe(context) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Muse request failed (${response.status})`);
    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    console.info(
      `[ai] ${PLAN_PROMPT_VERSION} model=${this.model} in=${body.usage?.prompt_tokens ?? 0} out=${body.usage?.completion_tokens ?? 0}`,
    );
    const content = body.choices?.[0]?.message?.content;
    if (!content) return [];
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      const match = /\{[\s\S]*\}/.exec(content);
      json = match ? JSON.parse(match[0]) : null;
    }
    const parsed = suggestionsSchema.safeParse(json);
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

/**
 * Picks the drafter from env: Meta Muse when `TIWA_MUSE_API` is set (D-X32),
 * else Claude when `LLM_PROVIDER=anthropic` with `LLM_API_KEY`, else the Fake.
 */
export function planDrafterFromEnv(env: {
  LLM_PROVIDER?: string | undefined;
  LLM_API_KEY?: string | undefined;
  LLM_MODEL_DRAFT?: string | undefined;
  TIWA_MUSE_API?: string | undefined;
  TIWA_MUSE_MODEL?: string | undefined;
}): PlanDrafter {
  if (env.TIWA_MUSE_API) {
    return new MusePlanDrafter(env.TIWA_MUSE_API, env.TIWA_MUSE_MODEL || 'muse-spark-1.3-contributor');
  }
  if (env.LLM_PROVIDER === 'anthropic' && env.LLM_API_KEY) {
    return new ClaudePlanDrafter(env.LLM_API_KEY, env.LLM_MODEL_DRAFT || 'claude-opus-5-5');
  }
  return new FakePlanDrafter();
}

// ───────────── Guest messages (AI-04, UF-27 step 3; D-X41) ─────────────
// One prompt → a ready message plus who it is for. The model never sees a
// guest's name, phone or email: only counts, group names and event facts.
// `{name}` and `{link}` stay as placeholders and are filled per guest at send.

export type MessageKind = 'INVITE' | 'UPDATE' | 'REMINDER';
export type MessageAudience = 'all' | 'not_replied' | 'attending' | 'group';
export type MessageStyle = 'shorter' | 'formal' | 'warmer' | 'pidgin';

export interface MessageDraftContext {
  eventName: string;
  eventType: string;
  whenText: string | null;
  venue: string | null;
  daysUntilEvent: number | null;
  invitesSent: boolean;
  guestCounts: { total: number; notReplied: number; attending: number; maybe: number; declined: number };
  groups: string[];
  language: 'en' | 'pcm';
  prompt: string;
  /** Set when rewriting an earlier draft. */
  previous: string | null;
  style: MessageStyle | null;
}

export interface MessageDraft {
  message: string;
  kind: MessageKind;
  audience: MessageAudience;
  groupName: string | null;
  /** A few words for the review card, e.g. "Venue change for everyone". */
  headline: string;
}

export interface MessageDrafter {
  draftMessage(context: MessageDraftContext): Promise<MessageDraft | null>;
}

const draftSchema = z.object({
  message: z.string().min(1).max(2000),
  kind: z.enum(['INVITE', 'UPDATE', 'REMINDER']),
  audience: z.enum(['all', 'not_replied', 'attending', 'group']),
  groupName: z.string().nullable(),
  headline: z.string().max(120),
});

const MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description:
        'The message to send. Must contain {name} where the guest name goes and {link} where their personal link goes. Max 600 characters. No phone numbers, emails or URLs.',
    },
    kind: {
      type: 'string',
      enum: ['INVITE', 'UPDATE', 'REMINDER'],
      description:
        'INVITE for a first invitation, UPDATE for news or changes, REMINDER to nudge replies or attendance.',
    },
    audience: {
      type: 'string',
      enum: ['all', 'not_replied', 'attending', 'group'],
      description:
        'Who it is for. all = everyone; not_replied = no reply yet; attending = said yes; group = one guest group.',
    },
    groupName: { type: ['string', 'null'], description: 'The exact group name when audience is group, else null.' },
    headline: { type: 'string', description: 'Three to seven words summarising the message for the host.' },
  },
  required: ['message', 'kind', 'audience', 'groupName', 'headline'],
  additionalProperties: false,
} as const;

export const MESSAGE_PROMPT_VERSION = 'guest-message@1';
const MESSAGE_SYSTEM = [
  'You write short, warm messages that an event host sends to their guests by WhatsApp, SMS or email.',
  'The host gives one instruction. Decide the message, whether it is a first invitation, an update or a reminder, and who should get it.',
  'Use the event facts you are given; never invent dates, times, venues, prices or names.',
  'Always include the placeholders {name} (guest first name) and {link} (their personal RSVP link) exactly once each.',
  'Keep it under 600 characters, friendly and clear, no hashtags, at most one emoji.',
  'If the language is pcm, write in natural Nigerian Pidgin English.',
  'Never include phone numbers, email addresses or web links other than {link}.',
].join(' ');

function describeMessage(context: MessageDraftContext): string {
  const c = context.guestCounts;
  return [
    `Event: ${context.eventName} (${context.eventType})`,
    context.whenText ? `When: ${context.whenText}` : 'When: not set yet',
    context.venue ? `Where: ${context.venue}` : null,
    context.daysUntilEvent !== null ? `Days until the event: ${context.daysUntilEvent}` : null,
    `Invitations already sent: ${context.invitesSent ? 'yes' : 'no'}`,
    `Guests: ${c.total} total, ${c.notReplied} not replied, ${c.attending} coming, ${c.maybe} maybe, ${c.declined} not coming`,
    context.groups.length > 0 ? `Guest groups: ${context.groups.join(', ')}` : null,
    `Language: ${context.language === 'pcm' ? 'Nigerian Pidgin' : 'English'}`,
    context.previous ? `Earlier draft:\n${context.previous}` : null,
    context.style
      ? `Rewrite the earlier draft to be: ${context.style === 'pidgin' ? 'in Nigerian Pidgin' : context.style}`
      : null,
    `Host's instruction:\n${context.prompt}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export class ClaudeMessageDrafter implements MessageDrafter {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model = 'claude-opus-5-5',
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async draftMessage(context: MessageDraftContext): Promise<MessageDraft | null> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4000,
      output_config: { effort: 'low', format: jsonSchemaOutputFormat(MESSAGE_SCHEMA) },
      system: MESSAGE_SYSTEM,
      messages: [{ role: 'user', content: describeMessage(context) }],
    });
    console.info(
      `[ai] ${MESSAGE_PROMPT_VERSION} model=${this.model} in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
    );
    if (response.stop_reason === 'refusal') return null;
    const parsed = draftSchema.safeParse(response.parsed_output);
    return parsed.success ? parsed.data : null;
  }
}

export class MuseMessageDrafter implements MessageDrafter {
  constructor(
    private readonly apiKey: string,
    private readonly model = 'muse-spark-1.3-contributor',
    private readonly baseUrl = MUSE_BASE_URL,
  ) {}

  async draftMessage(context: MessageDraftContext): Promise<MessageDraft | null> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: this.model,
        reasoning_effort: 'low',
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${MESSAGE_SYSTEM} Reply with JSON only, exactly this shape: {"message":string,"kind":"INVITE"|"UPDATE"|"REMINDER","audience":"all"|"not_replied"|"attending"|"group","groupName":string|null,"headline":string}.`,
          },
          { role: 'user', content: describeMessage(context) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Muse request failed (${response.status})`);
    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    console.info(
      `[ai] ${MESSAGE_PROMPT_VERSION} model=${this.model} in=${body.usage?.prompt_tokens ?? 0} out=${body.usage?.completion_tokens ?? 0}`,
    );
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    const match = /\{[\s\S]*\}/.exec(content);
    let json: unknown;
    try {
      json = JSON.parse(match ? match[0] : content);
    } catch {
      return null;
    }
    const parsed = draftSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  }
}

/** Deterministic drafter for tests and keyless local work: reads intent from keywords. */
export class FakeMessageDrafter implements MessageDrafter {
  async draftMessage(context: MessageDraftContext): Promise<MessageDraft> {
    const prompt = context.prompt.toLowerCase();
    const pidgin = context.language === 'pcm' || context.style === 'pidgin';
    const reminder = /(remind|reply|rsvp|haven'?t|not replied|nudge)/.test(prompt);
    const update =
      !reminder &&
      (context.invitesSent || /(moved|change|update|now|later|earlier|cancel|new time|new venue)/.test(prompt));
    const kind: MessageKind = reminder ? 'REMINDER' : update ? 'UPDATE' : 'INVITE';
    const group = context.groups.find((name) => prompt.includes(name.toLowerCase())) ?? null;
    const audience: MessageAudience = group
      ? 'group'
      : reminder || /(not replied|haven'?t replied|no reply)/.test(prompt)
        ? 'not_replied'
        : /(coming|attending|confirmed|said yes)/.test(prompt)
          ? 'attending'
          : 'all';
    const when = context.whenText ? ` on ${context.whenText}` : '';
    const where = context.venue ? ` at ${context.venue}` : '';
    const detail = context.prompt.trim().replace(/\s+/g, ' ').slice(0, 200);
    let message =
      kind === 'INVITE'
        ? pidgin
          ? `Hello {name}! You dey invited to ${context.eventName}${when}${where}. Abeg tell us if you go come: {link}`
          : `Hi {name}, you're invited to ${context.eventName}${when}${where}. We'd love to see you there. Please reply here: {link}`
        : kind === 'REMINDER'
          ? pidgin
            ? `Hello {name}, abeg no forget to tell us if you go come for ${context.eventName}${when}. Reply here: {link}`
            : `Hi {name}, a quick reminder to let us know if you can make it to ${context.eventName}${when}. Reply here: {link}`
          : pidgin
            ? `Hello {name}, small update for ${context.eventName}: ${detail}. See everything here: {link}`
            : `Hi {name}, an update about ${context.eventName}: ${detail}. All the details are here: {link}`;
    if (context.style === 'shorter') message = message.split('. ')[0]!.replace(/\.?$/, '') + ': {link}';
    if (context.style === 'formal') message = message.replace(/^Hi \{name\},/, 'Dear {name},');
    if (context.style === 'warmer') message = message.replace(/^Hi \{name\},/, 'Hi {name} 💛,');
    const headline =
      kind === 'INVITE'
        ? 'Invitation to your guests'
        : kind === 'REMINDER'
          ? 'Reminder to reply'
          : 'Update for your guests';
    return { message, kind, audience, groupName: group, headline };
  }
}

/** Same provider choice as `planDrafterFromEnv`. */
export function messageDrafterFromEnv(env: Parameters<typeof planDrafterFromEnv>[0]): MessageDrafter {
  if (env.TIWA_MUSE_API) {
    return new MuseMessageDrafter(env.TIWA_MUSE_API, env.TIWA_MUSE_MODEL || 'muse-spark-1.3-contributor');
  }
  if (env.LLM_PROVIDER === 'anthropic' && env.LLM_API_KEY) {
    return new ClaudeMessageDrafter(env.LLM_API_KEY, env.LLM_MODEL_DRAFT || 'claude-opus-5-5');
  }
  return new FakeMessageDrafter();
}
