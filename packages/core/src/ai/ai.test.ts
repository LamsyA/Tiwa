import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { requestQuotes } from '../quotes/requests.js';
import { draftBudgetSplit, splitByPercent, type BudgetDraftContext } from './budget.js';
import { captionPendingMedia } from './captions.js';
import { aiCompareQuotes, type QuoteCompareContext } from './compare.js';
import { aiGuestImpact, type GuestImpactContext } from './impact.js';
import { aiUsageRecorder, assertAiQuota } from './usage.js';

// P15 (D-X42): budget split, quote comparison, guest-count impact, captions,
// daily caps. Each checks what the model was given (UF-27-2/6) and that
// nothing is saved without the user's confirm (AI-06).

type UserActor = { kind: 'user'; userId: string; isAdmin: false };
const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

let host: UserActor;
let coHost: UserActor;
let eventId = '';

async function addMember(user: UserActor, preset: 'contributor' | 'view_only') {
  await prisma.eventParticipant.create({
    data: {
      eventId,
      userId: user.userId,
      role: 'CO_HOST',
      permissions: toStoredPermissions(permissionsFor('CO_HOST', preset)),
    },
  });
}

async function vendorWithQuote(
  name: string,
  totalMinor: bigint,
  items: { name: string; qty: number; unitMinor: string }[],
) {
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name, slug: `${name.toLowerCase().replace(/\W/g, '')}-${Date.now()}`, countryCode: 'NG' },
  });
  orgs.push(org.id);
  await prisma.businessProfile.create({
    data: { orgId: org.id, categories: ['catering'], city: 'Lagos', currency: 'NGN', published: true },
  });
  const req = await requestQuotes(host, { eventId, category: 'catering', vendorOrgIds: [org.id] });
  await prisma.quote.create({
    data: {
      requestId: req.requests[0]!.id as string,
      eventId,
      vendorOrgId: org.id,
      items,
      taxBps: 750,
      serviceBps: 0,
      travelFeeMinor: 0n,
      subtotalMinor: totalMinor,
      totalMinor,
      currency: 'NGN',
      notes: 'Call 08031234567 for tasting',
      cancellationTerms: 'No refunds',
      proposedSchedule: [{ label: 'Deposit', percentBps: 5000, due: 'on_accept' }],
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'SENT',
      sentAt: new Date(),
    },
  });
}

beforeAll(async () => {
  host = await makeUser('AI Host');
  coHost = await makeUser('AI Contributor');
  ({ eventId } = await createEventDraft(host, { type: 'birthday' }));
  events.push(eventId);
  await prisma.event.update({
    where: { id: eventId },
    data: { plannedBudgetMinor: 100_000_000n, expectedGuests: 100 },
  });
  await prisma.budgetCategory.createMany({
    data: [
      { eventId, key: 'venue', label: 'Venue', sortOrder: 0 },
      { eventId, key: 'catering', label: 'Food', sortOrder: 1 },
      { eventId, key: 'misc', label: 'Other', sortOrder: 2 },
    ],
    skipDuplicates: true,
  });
  await addMember(coHost, 'contributor');
  await prisma.guest.create({
    data: { eventId, name: 'Secret Guestname', phone: '08099990000', email: 'guest@x.com' },
  });
});

afterAll(async () => {
  await prisma.aiUsage.deleteMany({ where: { OR: [{ userId: { in: users } }, { eventId: { in: events } }] } });
  await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
  await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
  for (const id of orgs) {
    await prisma.businessProfile.deleteMany({ where: { orgId: id } });
    await prisma.organization.delete({ where: { id } });
  }
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.budgetCategory.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('AI budget split (AI-01)', () => {
  it('splitByPercent always adds up to the exact total', () => {
    const parts = splitByPercent(100_001n, [
      { key: 'a', percent: 33 },
      { key: 'b', percent: 33 },
      { key: 'c', percent: 34 },
    ]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(100_001n);
  });

  it('proposes amounts for known categories only and saves nothing', async () => {
    const seen: BudgetDraftContext[] = [];
    const split = await draftBudgetSplit(
      {
        async draftBudget(context) {
          seen.push(context);
          return {
            lines: [
              { key: 'catering', percent: 50, why: 'Food first' },
              { key: 'venue', percent: 40, why: '' },
              { key: 'invented', percent: 10, why: '' },
            ],
            note: 'ok',
          };
        },
      },
      host,
      { eventId, request: 'Food matters most, call me on 08031234567' },
    );
    expect(seen[0]!.request).not.toContain('08031234567');
    expect(split.lines.map((line) => line.key)).toEqual(['venue', 'catering', 'misc']);
    expect(split.lines.reduce((sum, line) => sum + BigInt(line.plannedMinor), 0n)).toBe(100_000_000n);
    expect(split.lines.find((line) => line.key === 'misc')!.plannedMinor).toBe('0');
    const saved = await prisma.budgetCategory.findMany({ where: { eventId } });
    expect(saved.every((row) => row.plannedMinor === 0n)).toBe(true);
  });

  it('members without money.edit cannot ask', async () => {
    await expect(
      draftBudgetSplit({ draftBudget: async () => ({ lines: [], note: '' }) }, coHost, { eventId }),
    ).rejects.toThrow();
  });
});

describe('AI quote comparison (AI-02)', () => {
  it('host sees amounts; a member without money.view gets no amounts in the prompt (UF-27-2)', async () => {
    await vendorWithQuote('Mama Put Catering', 300_000_00n, [{ name: 'Jollof rice', qty: 100, unitMinor: '300000' }]);
    await vendorWithQuote('Chop Life Foods', 250_000_00n, [
      { name: 'Jollof rice', qty: 100, unitMinor: '200000' },
      { name: 'Small chops', qty: 100, unitMinor: '50000' },
    ]);
    const seen: QuoteCompareContext[] = [];
    const comparer = {
      async compareQuotes(context: QuoteCompareContext) {
        seen.push(context);
        return {
          summary: 'B is cheaper',
          quotes: context.quotes.map((quote) => ({
            ref: quote.ref,
            strengths: [],
            missing: [],
            unclear: [],
            extraFees: ['Tax'],
          })),
          questions: [],
        };
      },
    };
    const forHost = await aiCompareQuotes(comparer, host, { eventId, category: 'catering', categoryLabel: 'Catering' });
    expect(forHost.moneyVisible).toBe(true);
    expect(seen[0]!.quotes.map((quote) => quote.total)).toContain('300000');
    expect(JSON.stringify(seen[0])).not.toContain('08031234567');

    const forMember = await aiCompareQuotes(comparer, coHost, {
      eventId,
      category: 'catering',
      categoryLabel: 'Catering',
    });
    expect(forMember.moneyVisible).toBe(false);
    const memberPrompt = JSON.stringify(seen[1]);
    expect(memberPrompt).not.toMatch(/300000|250000|200000/);
    expect(seen[1]!.quotes.every((quote) => quote.total === 'hidden')).toBe(true);
    expect(forMember.quotes.every((quote) => quote.extraFees.length === 0)).toBe(true);
    // Read-only: both quotes are still just SENT.
    const statuses = await prisma.quote.findMany({ where: { eventId }, select: { status: true } });
    expect(statuses.every((row) => row.status === 'SENT')).toBe(true);
  });
});

describe('guest-count impact (AI-03)', () => {
  it('uses counts and quantities, never guest names or contacts', async () => {
    const seen: GuestImpactContext[] = [];
    const result = await aiGuestImpact(
      {
        async guestImpact(context) {
          seen.push(context);
          return { items: [{ area: 'Food', change: 'more', action: 'call caterer', urgency: 'urgent' as never }] };
        },
      },
      host,
      { eventId, toGuests: 150 },
    );
    expect(result.fromGuests).toBe(100);
    expect(result.items[0]!.urgency).toBe('medium');
    const prompt = JSON.stringify(seen[0]);
    expect(prompt).not.toContain('Secret Guestname');
    expect(prompt).not.toContain('08099990000');
    expect(prompt).not.toContain('guest@x.com');
  });
});

describe('daily caps (Backend.md §9.1)', () => {
  it('blocks a user after their daily tokens, and logs usage per call', async () => {
    const capped = await makeUser('AI Capped');
    await assertAiQuota(capped.userId, eventId, { perUser: 1000, perEvent: 1_000_000 });
    await aiUsageRecorder(
      capped.userId,
      eventId,
    )({
      feature: 'plan',
      promptVersion: 'plan-draft@3',
      model: 'muse',
      inputTokens: 600,
      outputTokens: 500,
    });
    await expect(assertAiQuota(capped.userId, eventId, { perUser: 1000, perEvent: 1_000_000 })).rejects.toThrow(
      /Daily AI limit/,
    );
    await expect(assertAiQuota(host.userId, eventId, { perUser: 1000, perEvent: 1000 })).rejects.toThrow();
  });
});

describe('Moments alt text (AI-05)', () => {
  it('fills only empty alt text', async () => {
    const gallery = await prisma.gallery.create({ data: { eventId, code: `ai${Date.now().toString(36)}` } });
    const base = { galleryId: gallery.id, album: 'GUEST' as const, kind: 'PHOTO' as const, sizeBytes: 10 };
    const empty = await prisma.mediaItem.create({
      data: { ...base, state: 'PUBLISHED', originalKey: 'o1', thumbKey: 't1' },
    });
    const written = await prisma.mediaItem.create({
      data: { ...base, state: 'PUBLISHED', originalKey: 'o2', thumbKey: 't2', altText: 'Written by a person' },
    });
    try {
      const result = await captionPendingMedia(
        { caption: async () => 'Two people dancing under string lights' },
        async () => 'data:image/jpeg;base64,AAAA',
      );
      expect(result.captioned).toBeGreaterThanOrEqual(1);
      expect((await prisma.mediaItem.findUniqueOrThrow({ where: { id: empty.id } })).altText).toBe(
        'Two people dancing under string lights',
      );
      expect((await prisma.mediaItem.findUniqueOrThrow({ where: { id: written.id } })).altText).toBe(
        'Written by a person',
      );
    } finally {
      await prisma.mediaItem.deleteMany({ where: { galleryId: gallery.id } });
      await prisma.gallery.delete({ where: { id: gallery.id } });
    }
  });
});
