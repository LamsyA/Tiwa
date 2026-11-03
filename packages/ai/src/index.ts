import { MUSE_DEFAULT_MODEL, MuseClient, type UsageHook } from './llm.js';
import { BUDGET_PROMPT_VERSION, BUDGET_SYSTEM, budgetSchema, describeBudget } from './prompts/budget.js';
import type { BudgetDraftContext, BudgetSplitDraft } from './prompts/budget.js';
import { CAPTION_PROMPT_VERSION, CAPTION_SYSTEM, captionSchema, describeCaption } from './prompts/caption.js';
import type { CaptionContext } from './prompts/caption.js';
import { COMPARE_PROMPT_VERSION, COMPARE_SYSTEM, compareSchema, describeCompare } from './prompts/compare.js';
import type { QuoteCompareContext, QuoteComparison } from './prompts/compare.js';
import { IMPACT_PROMPT_VERSION, IMPACT_SYSTEM, describeImpact, impactSchema } from './prompts/impact.js';
import type { GuestImpactContext, GuestImpactList } from './prompts/impact.js';
import { MESSAGE_PROMPT_VERSION, MESSAGE_SYSTEM, describeMessage, messageSchema } from './prompts/message.js';
import type { MessageAudience, MessageDraft, MessageDraftContext, MessageKind } from './prompts/message.js';
import { PLAN_PROMPT_VERSION, PLAN_SYSTEM, describePlan, planSchema } from './prompts/plan.js';
import type { PlanDraftContext, PlanDraftSuggestion } from './prompts/plan.js';

// AI assistant (PRD AI-01…AI-06, Backend.md §9.1; D-X31, D-X41, D-X42).
// Meta Muse Spark is the only real model. Without `TIWA_MUSE_API` every
// feature runs on deterministic Fakes (tests, keyless local work). Shapes
// match @tiwa/core's drafter interfaces structurally, so this package never
// imports core. Prompts are versioned in ./prompts; outputs are Zod-checked;
// invalid output becomes an empty/null result, never a partial save.

export * from './llm.js';
export * from './prompts/budget.js';
export * from './prompts/caption.js';
export * from './prompts/compare.js';
export * from './prompts/impact.js';
export * from './prompts/message.js';
export * from './prompts/plan.js';

export interface PlanDrafter {
  draftTasks(context: PlanDraftContext): Promise<PlanDraftSuggestion[]>;
}
export interface MessageDrafter {
  draftMessage(context: MessageDraftContext): Promise<MessageDraft | null>;
}
export interface BudgetDrafter {
  draftBudget(context: BudgetDraftContext): Promise<BudgetSplitDraft | null>;
}
export interface QuoteComparer {
  compareQuotes(context: QuoteCompareContext): Promise<QuoteComparison | null>;
}
export interface ImpactDrafter {
  guestImpact(context: GuestImpactContext): Promise<GuestImpactList | null>;
}
export interface Captioner {
  caption(context: CaptionContext): Promise<string | null>;
}

export type Assistant = PlanDrafter & MessageDrafter & BudgetDrafter & QuoteComparer & ImpactDrafter & Captioner;

/** Token caps per call (§9.1): enough room for the model to reason, never unbounded. */
const MAX_TOKENS = { plan: 8000, message: 4000, budget: 4000, compare: 6000, impact: 4000, caption: 1500 } as const;

export class MuseAssistant implements Assistant {
  private readonly client: MuseClient;

  constructor(apiKey: string, model = MUSE_DEFAULT_MODEL, onUsage?: UsageHook, baseUrl?: string) {
    this.client = new MuseClient(apiKey, model, onUsage, baseUrl);
  }

  async draftTasks(context: PlanDraftContext): Promise<PlanDraftSuggestion[]> {
    const json = await this.client.json({
      feature: 'plan',
      promptVersion: PLAN_PROMPT_VERSION,
      system: PLAN_SYSTEM,
      user: describePlan(context),
      maxTokens: MAX_TOKENS.plan,
    });
    const parsed = planSchema.safeParse(json);
    return parsed.success ? parsed.data.tasks : [];
  }

  async draftMessage(context: MessageDraftContext): Promise<MessageDraft | null> {
    const json = await this.client.json({
      feature: 'message',
      promptVersion: MESSAGE_PROMPT_VERSION,
      system: MESSAGE_SYSTEM,
      user: describeMessage(context),
      maxTokens: MAX_TOKENS.message,
    });
    const parsed = messageSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  }

  async draftBudget(context: BudgetDraftContext): Promise<BudgetSplitDraft | null> {
    const json = await this.client.json({
      feature: 'budget',
      promptVersion: BUDGET_PROMPT_VERSION,
      system: BUDGET_SYSTEM,
      user: describeBudget(context),
      maxTokens: MAX_TOKENS.budget,
    });
    const parsed = budgetSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  }

  async compareQuotes(context: QuoteCompareContext): Promise<QuoteComparison | null> {
    const json = await this.client.json({
      feature: 'compare',
      promptVersion: COMPARE_PROMPT_VERSION,
      system: COMPARE_SYSTEM,
      user: describeCompare(context),
      maxTokens: MAX_TOKENS.compare,
    });
    const parsed = compareSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  }

  async guestImpact(context: GuestImpactContext): Promise<GuestImpactList | null> {
    const json = await this.client.json({
      feature: 'impact',
      promptVersion: IMPACT_PROMPT_VERSION,
      system: IMPACT_SYSTEM,
      user: describeImpact(context),
      maxTokens: MAX_TOKENS.impact,
    });
    const parsed = impactSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  }

  async caption(context: CaptionContext): Promise<string | null> {
    const json = await this.client.json({
      feature: 'caption',
      promptVersion: CAPTION_PROMPT_VERSION,
      system: CAPTION_SYSTEM,
      user: describeCaption(context),
      images: [context.image],
      maxTokens: MAX_TOKENS.caption,
    });
    const parsed = captionSchema.safeParse(json);
    return parsed.success && parsed.data.alt.trim() ? parsed.data.alt.trim() : null;
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

/** Deterministic budget split: weights by common category keys, the rest share what is left. */
export class FakeBudgetDrafter implements BudgetDrafter {
  async draftBudget(context: BudgetDraftContext): Promise<BudgetSplitDraft> {
    const weights: Record<string, number> = {
      venue: 30,
      catering: 30,
      food: 30,
      decor: 10,
      decoration: 10,
      entertainment: 8,
      music: 8,
      photography: 8,
      photo: 8,
      attire: 5,
      invitations: 2,
      transport: 4,
      cake: 3,
    };
    const raw = context.categories.map((row) => ({
      key: row.key,
      weight: weights[row.key.toLowerCase()] ?? weights[row.label.toLowerCase()] ?? 5,
    }));
    const sum = raw.reduce((total, row) => total + row.weight, 0) || 1;
    const lines = raw.map((row) => ({
      key: row.key,
      percent: Math.floor((row.weight * 100) / sum),
      why: 'Typical share for this kind of event.',
    }));
    const left = 100 - lines.reduce((total, row) => total + row.percent, 0);
    if (lines[0]) lines[0].percent += left;
    return { lines, note: 'Keep about 10% of each line spare for last-minute costs.' };
  }
}

/** Deterministic comparison: cheapest total, missing items, fees and terms by simple rules. */
export class FakeQuoteComparer implements QuoteComparer {
  async compareQuotes(context: QuoteCompareContext): Promise<QuoteComparison> {
    const names = new Set(context.quotes.flatMap((quote) => quote.items.map((item) => item.name.toLowerCase())));
    const cheapest = [...context.quotes].sort((a, b) => Number(a.total) - Number(b.total))[0];
    return {
      summary: cheapest
        ? `Quote ${cheapest.ref} (${cheapest.vendor}) has the lowest total. Check what each one includes before deciding.`
        : 'No quotes to compare yet.',
      quotes: context.quotes.map((quote) => {
        const own = new Set(quote.items.map((item) => item.name.toLowerCase()));
        return {
          ref: quote.ref,
          strengths: quote.ref === cheapest?.ref ? ['Lowest total'] : [],
          missing: [...names].filter((name) => !own.has(name)).slice(0, 8),
          unclear: quote.cancellationTerms.trim().length < 20 ? ['Cancellation terms are very short'] : [],
          extraFees: [
            ...(quote.taxPercent > 0 ? [`Tax ${quote.taxPercent}%`] : []),
            ...(quote.servicePercent > 0 ? [`Service charge ${quote.servicePercent}%`] : []),
            ...(Number(quote.travelFee) > 0 ? [`Travel fee ${quote.travelFee}`] : []),
          ],
        };
      }),
      questions: ['What exactly is included per head?', 'How much is refunded if you cancel?'],
    };
  }
}

/** Deterministic impact list: scales every booked item and checks seating. */
export class FakeImpactDrafter implements ImpactDrafter {
  async guestImpact(context: GuestImpactContext): Promise<GuestImpactList> {
    const ratio = context.fromGuests > 0 ? context.toGuests / context.fromGuests : 1;
    const more = context.toGuests > context.fromGuests;
    const items: GuestImpactList['items'] = context.bookings.flatMap((booking) =>
      booking.items.slice(0, 2).map((item) => ({
        area: booking.category,
        change: `${item.name}: ${item.qty} → about ${Math.max(1, Math.round(item.qty * ratio))}`,
        action: `Ask ${booking.vendor} to ${more ? 'increase' : 'reduce'} the order.`,
        urgency: 'high' as const,
      })),
    );
    if (context.tables && context.toGuests > context.tables.seats) {
      items.push({
        area: 'Seating',
        change: `${context.toGuests} guests for ${context.tables.seats} seats`,
        action: 'Add tables or seats.',
        urgency: 'high',
      });
    }
    items.push({
      area: 'Invitations',
      change: more ? `${context.toGuests - context.fromGuests} more guests to invite` : 'Fewer guests coming',
      action: more ? 'Add the new guests and send their invites.' : 'Update your guest list.',
      urgency: 'medium',
    });
    return { items };
  }
}

/** Deterministic alt text (no model): describes the album and event type. */
export class FakeCaptioner implements Captioner {
  async caption(context: CaptionContext): Promise<string> {
    return `${context.album === 'OFFICIAL' ? 'Photo' : 'Guest photo'} from the ${context.eventType.toLowerCase()}.`;
  }
}

export class FakeAssistant implements Assistant {
  private readonly plan = new FakePlanDrafter();
  private readonly message = new FakeMessageDrafter();
  private readonly budget = new FakeBudgetDrafter();
  private readonly compare = new FakeQuoteComparer();
  private readonly impact = new FakeImpactDrafter();
  private readonly captioner = new FakeCaptioner();
  draftTasks(context: PlanDraftContext) {
    return this.plan.draftTasks(context);
  }
  draftMessage(context: MessageDraftContext) {
    return this.message.draftMessage(context);
  }
  draftBudget(context: BudgetDraftContext) {
    return this.budget.draftBudget(context);
  }
  compareQuotes(context: QuoteCompareContext) {
    return this.compare.compareQuotes(context);
  }
  guestImpact(context: GuestImpactContext) {
    return this.impact.guestImpact(context);
  }
  caption(context: CaptionContext) {
    return this.captioner.caption(context);
  }
}

export interface AiEnv {
  TIWA_MUSE_API?: string | undefined;
  TIWA_MUSE_MODEL?: string | undefined;
}

/** Muse when `TIWA_MUSE_API` is set (D-X42: the only real model), else the Fakes. */
export function assistantFromEnv(env: AiEnv, onUsage?: UsageHook): Assistant {
  if (env.TIWA_MUSE_API)
    return new MuseAssistant(env.TIWA_MUSE_API, env.TIWA_MUSE_MODEL || MUSE_DEFAULT_MODEL, onUsage);
  return new FakeAssistant();
}

/** @deprecated use assistantFromEnv */
export const planDrafterFromEnv = (env: AiEnv, onUsage?: UsageHook): PlanDrafter => assistantFromEnv(env, onUsage);
/** @deprecated use assistantFromEnv */
export const messageDrafterFromEnv = (env: AiEnv, onUsage?: UsageHook): MessageDrafter =>
  assistantFromEnv(env, onUsage);
