import { z } from 'zod';

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

export const MESSAGE_PROMPT_VERSION = 'guest-message@2';

export const messageSchema = z.object({
  message: z.string().min(1).max(2000),
  kind: z.enum(['INVITE', 'UPDATE', 'REMINDER']),
  audience: z.enum(['all', 'not_replied', 'attending', 'group']),
  groupName: z.string().nullable(),
  headline: z.string().max(120),
});

export const MESSAGE_SYSTEM = [
  'You write short, warm messages that an event host sends to their guests by WhatsApp, SMS or email.',
  'The host gives one instruction. Decide the message, whether it is a first invitation, an update or a reminder, and who should get it.',
  'Use the event facts you are given; never invent dates, times, venues, prices or names.',
  'Always include the placeholders {name} (guest first name) and {link} (their personal RSVP link) exactly once each.',
  'Keep it under 600 characters, friendly and clear, no hashtags, at most one emoji.',
  'If the language is pcm, write in natural Nigerian Pidgin English.',
  'Never include phone numbers, email addresses or web links other than {link}.',
  'Reply with JSON only, exactly this shape: {"message":string,"kind":"INVITE"|"UPDATE"|"REMINDER","audience":"all"|"not_replied"|"attending"|"group","groupName":string|null,"headline":string}. audience: all = everyone, not_replied = no reply yet, attending = said yes, group = one guest group (give its exact name). headline: three to seven words for the host.',
].join(' ');

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
