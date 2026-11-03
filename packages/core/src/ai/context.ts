import { eventTypeLabel } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import type { Action } from '../auth/actions.js';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { authorize } from '../auth/authorize.js';
import { scanContactInfo } from '../chat/masking.js';
import { requireEventAccess } from '../events/access.js';
import { pricesHiddenFor, priceVisibilityFor } from '../events/prices.js';
import { requireFlag } from '../flags/flags.js';

// Permission-filtered AI context (P15-T02, Backend.md §9.1, UF-27-2/6). Every
// AI feature starts here: it checks the feature flag and both permissions as
// the actor, and says whether money may appear. Facts carry no guest names,
// phones or emails; free text is masked before it reaches a prompt.

type UserActor = Extract<Actor, { kind: 'user' }>;
const DAY_MS = 86_400_000;

export interface AiEventContext {
  access: EventAccess;
  /** False for members without money.view or when a planner hides vendor prices. */
  moneyVisible: boolean;
  event: {
    id: string;
    name: string;
    typeLabel: string;
    format: string;
    countryCode: string;
    currency: string;
    expectedGuests: number | null;
    plannedBudgetMinor: bigint;
    daysUntilEvent: number | null;
  };
}

function allowed(actor: UserActor, action: Action, eventId: string, access: EventAccess) {
  try {
    authorize(actor, action, { eventId, access });
    return true;
  } catch {
    return false;
  }
}

/** Gate + facts for one AI call: `needs` is the data permission, `ai` the AI action. */
export async function aiEventContext(
  actor: UserActor,
  eventId: string,
  needs: Action,
  ai: Action,
  now = new Date(),
): Promise<AiEventContext> {
  const access = await requireEventAccess(actor, eventId, needs);
  authorize(actor, ai, { eventId, access });
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      type: true,
      typeLabel: true,
      format: true,
      countryCode: true,
      currency: true,
      startsAt: true,
      expectedGuests: true,
      plannedBudgetMinor: true,
    },
  });
  await requireFlag('ai.enabled', event.countryCode);
  const moneyVisible =
    allowed(actor, 'money.view', eventId, access) && !pricesHiddenFor(access, await priceVisibilityFor(eventId));
  return {
    access,
    moneyVisible,
    event: {
      id: event.id,
      name: event.name,
      typeLabel: eventTypeLabel(event),
      format: event.format,
      countryCode: event.countryCode,
      currency: event.currency,
      expectedGuests: event.expectedGuests ?? null,
      plannedBudgetMinor: event.plannedBudgetMinor,
      daysUntilEvent: event.startsAt
        ? Math.max(0, Math.round((event.startsAt.getTime() - now.getTime()) / DAY_MS))
        : null,
    },
  };
}

/** Free text (host requests, vendor notes) with phones, emails and handles masked. */
export function aiSafeText(text: string | null | undefined, countryCode: string, max = 1000): string {
  return scanContactInfo((text ?? '').slice(0, max), countryCode).masked;
}

/** Minor units → major-unit text for prompts (integer maths, no floats). */
export function toMajor(minor: bigint, currency: string): string {
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10n ** BigInt(digits);
  const whole = minor / scale;
  const frac = minor % scale;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(digits, '0')}`;
}
