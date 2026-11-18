import { z } from 'zod';
import { withTiwa } from './tiwa.js';

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
  previous: string | null;
  style: MessageStyle | null;
}

export interface MessageDraft {
  message: string;
  kind: MessageKind;
  audience: MessageAudience;
  groupName: string | null;
  headline: string;
}

export const MESSAGE_PROMPT_VERSION = 'guest-message@3';

export const messageSchema = z.object({
  message: z.string().min(1).max(2000),
  kind: z.enum(['INVITE', 'UPDATE', 'REMINDER']),
  audience: z.enum(['all', 'not_replied', 'attending', 'group']),
  groupName: z.string().nullable(),
  headline: z.string().max(120),
});

export const MESSAGE_SYSTEM = withTiwa(
  [
    'Write the message the host sends to guests from the Invites tab by WhatsApp, SMS or email.',
    'The host gives one instruction. Decide the message, whether it is a first invitation, an update or a reminder, and who should get it (everyone, people who have not replied, people coming, or one guest group).',
    'Use only the event facts given (name, date, time, venue, days left); never invent dates, times, venues, dress codes, prices or names. If the host mentions a dress code or colour (aso-ebi), include it.',
    'Always include the placeholders {name} (guest first name) and {link} (their personal RSVP link) exactly once each. Tell guests what to do with the link (reply, see the programme, get their entry pass).',
    'Keep it under 600 characters, warm and clear, at most one emoji, no hashtags. If the language is pcm, write natural Nigerian Pidgin.',
    'Never include phone numbers, email addresses or links other than {link}.',
    'Reply with JSON only, exactly: {"message":string,"kind":"INVITE"|"UPDATE"|"REMINDER","audience":"all"|"not_replied"|"attending"|"group","groupName":string|null,"headline":string}. groupName: the exact group name when audience is group. headline: three to seven words for the host.',
  ].join('\n'),
);

export function describeMessage(context: MessageDraftContext): string {
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
