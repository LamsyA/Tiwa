import { eventTypeLabel } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { authorize } from '../auth/authorize.js';
import { scanContactInfo } from '../chat/masking.js';
import { requireEventAccess } from '../events/access.js';
import { requireFlag } from '../flags/flags.js';
import { RateLimitedError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import {
  createInviteBatch,
  estimateInviteBatch,
  sendInviteBatch,
  type BatchEstimate,
  type ComposerChannel,
  type InviteAudience,
} from './batches.js';

// One-prompt invites and updates (PRD AI-04, UF-27 step 3; D-X41). The host
// types one instruction; an LLM drafts the message and suggests who it is
// for. Two rules hold on the server, not just in the UI:
//  1. Nothing is sent by the AI. `draftGuestMessage` only returns a draft and
//     an estimate; sending is `sendDraftedMessage`, called when the host taps
//     Send, with the exact text they saw (AI-06, UF-27-4).
//  2. Limited access. Both need `guests.manage` + `ai.draftMessage`, and the
//     model sees only counts, group names and event facts — never a guest's
//     name, phone or email. Contact details typed into the prompt are masked
//     before it leaves the server (UF-27-6).
// Core never imports an LLM SDK: the web app passes a `MessageDrafter` in.

type UserActor = Extract<Actor, { kind: 'user' }>;

export type MessageKind = 'INVITE' | 'UPDATE' | 'REMINDER';
export type MessageStyle = 'shorter' | 'formal' | 'warmer' | 'pidgin';

/** Everything the model sees (UF-27-6): no guest names, phones or emails. */
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
  previous: string | null;
  style: MessageStyle | null;
}

export interface MessageDrafter {
  draftMessage(context: MessageDraftContext): Promise<{
    message: string;
    kind: MessageKind;
    audience: 'all' | 'not_replied' | 'attending' | 'group';
    groupName: string | null;
    headline: string;
  } | null>;
}

/** WhatsApp first, then email, then SMS — per guest, from what they have. */
export const AI_CHANNELS: ComposerChannel[] = ['WHATSAPP', 'EMAIL', 'SMS'];
const DRAFTS_PER_HOUR = 30;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const audienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('not_replied') }),
  z.object({ type: z.literal('attending') }),
  z.object({ type: z.literal('group'), groupId: z.string().uuid() }),
]);

export const draftGuestMessageSchema = z.object({
  eventId: z.string().uuid(),
  prompt: z.string().trim().min(3, 'promptTooShort').max(1000, 'promptTooLong'),
  language: z.enum(['en', 'pcm']).default('en'),
  previous: z.string().max(2000).nullable().optional(),
  style: z.enum(['shorter', 'formal', 'warmer', 'pidgin']).nullable().optional(),
});

export interface AudienceOption {
  key: string;
  audience: InviteAudience;
  label: string | null;
  total: number;
}

export interface GuestMessageDraft {
  message: string;
  kind: MessageKind;
  headline: string;
  audience: InviteAudience;
  options: AudienceOption[];
  estimate: BatchEstimate;
}

/** Strip contact details and stray links; make sure {name} and {link} are there exactly as placeholders. */
export function cleanDraft(text: string, countryCode: string): string {
  let message = scanContactInfo(text.replace(/\r/g, ''), countryCode).masked;
  message = message
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  if (!message.includes('{name}')) message = `Hi {name}, ${message}`;
  if (!message.includes('{link}')) message = `${message.replace(/[.\s]*$/, '.')} {link}`;
  return message.slice(0, 2000);
}

async function aiAccess(actor: UserActor, eventId: string): Promise<EventAccess> {
  const access = await requireEventAccess(actor, eventId, 'guests.manage');
  authorize(actor, 'ai.draftMessage', { eventId, access });
  return access;
}

/** Draft only: returns a message, a suggested audience and what sending would reach. Sends nothing. */
export async function draftGuestMessage(
  drafter: MessageDrafter,
  actor: UserActor,
  raw: z.input<typeof draftGuestMessageSchema>,
  now = new Date(),
): Promise<GuestMessageDraft> {
  const input = draftGuestMessageSchema.parse(raw);
  const access = await aiAccess(actor, input.eventId);
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    select: {
      name: true,
      type: true,
      typeLabel: true,
      countryCode: true,
      startsAt: true,
      timezone: true,
      invitesEnabled: true,
      days: { orderBy: { date: 'asc' }, take: 1, select: { venueName: true } },
    },
  });
  await requireFlag('ai.enabled', event.countryCode);
  if (!event.invitesEnabled) throw new ValidationError('Turn invitations on first', { key: 'invitesOff' });
  const recent = await prisma.auditLog.count({
    where: {
      action: 'ai.draftMessage',
      targetType: 'Event',
      targetId: input.eventId,
      createdAt: { gte: new Date(now.getTime() - HOUR_MS) },
    },
  });
  if (recent >= DRAFTS_PER_HOUR) throw new RateLimitedError('Too many drafts this hour — try again later');

  const [replies, groups, sentBatches] = await Promise.all([
    prisma.guest.groupBy({
      by: ['rsvp'],
      where: { eventId: input.eventId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.guestGroup.findMany({
      where: { eventId: input.eventId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.inviteBatch.count({ where: { eventId: input.eventId, kind: 'INVITE', status: { not: 'DRAFT' } } }),
  ]);
  const count = (key: string) => replies.find((row) => row.rsvp === key)?._count._all ?? 0;

  const context: MessageDraftContext = {
    eventName: event.name,
    eventType: eventTypeLabel(event),
    whenText: event.startsAt
      ? new Intl.DateTimeFormat('en', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: event.timezone,
        }).format(event.startsAt)
      : null,
    venue: event.days[0]?.venueName ?? null,
    daysUntilEvent: event.startsAt
      ? Math.max(0, Math.round((event.startsAt.getTime() - now.getTime()) / DAY_MS))
      : null,
    invitesSent: sentBatches > 0,
    guestCounts: {
      total: replies.reduce((sum, row) => sum + row._count._all, 0),
      notReplied: count('NONE'),
      attending: count('YES'),
      maybe: count('MAYBE'),
      declined: count('NO'),
    },
    groups: groups.map((group) => group.name).slice(0, 50),
    language: input.style === 'pidgin' ? 'pcm' : input.language,
    // A phone or email typed into the prompt never reaches the model.
    prompt: scanContactInfo(input.prompt, event.countryCode).masked,
    previous: input.previous ? scanContactInfo(input.previous, event.countryCode).masked : null,
    style: input.style ?? null,
  };

  const draft = await drafter.draftMessage(context);
  await audit(prisma, {
    actor,
    action: 'ai.draftMessage',
    targetType: 'Event',
    targetId: input.eventId,
    data: { ok: draft !== null, kind: draft?.kind ?? null, promptChars: input.prompt.length },
  });
  if (!draft) throw new ValidationError('The assistant could not draft that — try rewording', { field: 'ai', key: 'noDraft' });

  const group =
    draft.audience === 'group' && draft.groupName
      ? groups.find((row) => row.name.trim().toLowerCase() === draft.groupName!.trim().toLowerCase())
      : undefined;
  const audience: InviteAudience = group
    ? { type: 'group', groupId: group.id }
    : draft.audience === 'not_replied' || draft.audience === 'attending'
      ? { type: draft.audience }
      : { type: 'all' };
  const kind = draft.kind;
  const message = cleanDraft(draft.message, event.countryCode);

  const optionList: { key: string; audience: InviteAudience; label: string | null }[] = [
    { key: 'all', audience: { type: 'all' }, label: null },
    { key: 'not_replied', audience: { type: 'not_replied' }, label: null },
    { key: 'attending', audience: { type: 'attending' }, label: null },
    ...groups.map((row) => ({
      key: `group:${row.id}`,
      audience: { type: 'group' as const, groupId: row.id },
      label: row.name,
    })),
  ];
  const estimates = await Promise.all(
    optionList.map((option) =>
      estimateInviteBatch(
        actor,
        { eventId: input.eventId, audience: option.audience, kind, channels: AI_CHANNELS, message },
        access,
      ),
    ),
  );
  const options = optionList.map((option, i) => ({ ...option, total: estimates[i]!.total }));
  const picked = optionList.findIndex((option) => JSON.stringify(option.audience) === JSON.stringify(audience));
  return {
    message,
    kind,
    headline: draft.headline.slice(0, 120),
    audience,
    options,
    estimate: estimates[Math.max(0, picked)]!,
  };
}

export const estimateDraftSchema = z.object({
  eventId: z.string().uuid(),
  audience: audienceSchema,
  kind: z.enum(['INVITE', 'UPDATE', 'REMINDER']),
  message: z.string().max(2000),
});

/** Re-count when the host changes the audience or type on the review card. */
export async function estimateDraft(actor: UserActor, raw: z.input<typeof estimateDraftSchema>) {
  const input = estimateDraftSchema.parse(raw);
  const access = await aiAccess(actor, input.eventId);
  return estimateInviteBatch(actor, { ...input, channels: AI_CHANNELS }, access);
}

export const sendDraftedMessageSchema = z.object({
  eventId: z.string().uuid(),
  audience: audienceSchema,
  kind: z.enum(['INVITE', 'UPDATE', 'REMINDER']),
  message: z.string().trim().min(1, 'messageRequired').max(2000, 'messageTooLong'),
  idempotencyKey: z.string().min(8).max(64),
});

/**
 * The host's one Send tap (AI-06): sends exactly the text they reviewed
 * (contact details still stripped, placeholders guaranteed) through the
 * normal invite batch, so tracking, retries and opt-outs all apply.
 */
export async function sendDraftedMessage(actor: UserActor, raw: z.input<typeof sendDraftedMessageSchema>) {
  const input = sendDraftedMessageSchema.parse(raw);
  const access = await aiAccess(actor, input.eventId);
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    select: { countryCode: true },
  });
  await requireFlag('ai.enabled', event.countryCode);
  const message = cleanDraft(input.message, event.countryCode);
  const preview = await createInviteBatch(
    actor,
    {
      eventId: input.eventId,
      audience: input.audience,
      channels: AI_CHANNELS,
      smart: true,
      message,
      kind: input.kind,
    },
    access,
  );
  if (preview.total === 0)
    throw new ValidationError('Nobody in this audience can be reached', { key: 'emptyAudience' });
  const sent = await sendInviteBatch(actor, { batchId: preview.batchId, idempotencyKey: input.idempotencyKey });
  await audit(prisma, {
    actor,
    action: 'ai.sendDraftedMessage',
    targetType: 'InviteBatch',
    targetId: preview.batchId,
    data: { kind: input.kind, queued: sent.queued },
  });
  return { batchId: preview.batchId, queued: sent.queued, unreachable: preview.needsLink.length };
}
