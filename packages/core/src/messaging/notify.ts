import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
import { enqueue } from '../shared/outbox.js';
import { uuidv7 } from '../shared/ids.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';

// One notification pipeline (P13-T03, MSG-15/MSG-16). `notify()` records the
// in-app row and fans remote delivery out through `messaging/notify`, which
// the worker sends after re-applying preferences and quiet hours. Urgent
// event-day and payment alerts override both (SMS/WhatsApp even on iOS,
// where web push needs a home-screen install).

type SystemActor = Extract<Actor, { kind: 'system' }>;

export type NotifyChannel = 'inApp' | 'push' | 'email' | 'sms' | 'whatsapp';

export interface ChannelPrefs {
  inApp: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

export interface NotifyTypeDef {
  /** Default channels when the user never touched this type. */
  channels: ChannelPrefs;
  /** Urgent types ignore quiet hours and force SMS + WhatsApp. */
  urgent: boolean;
}

const ALL_ON: ChannelPrefs = { inApp: true, push: true, email: true, sms: true, whatsapp: true };

/** Pipeline defaults per notification type (P13-T03). Unknown types fall
 * back to in-app + push, non-urgent. */
export const NOTIFY_TYPES: Record<string, NotifyTypeDef> = {
  'chat.message': {
    channels: { inApp: true, push: true, email: false, sms: false, whatsapp: false },
    urgent: false,
  },
  'booking.changed': {
    channels: { inApp: true, push: true, email: true, sms: false, whatsapp: false },
    urgent: false,
  },
  'booking.confirmed': {
    channels: { inApp: true, push: true, email: true, sms: false, whatsapp: false },
    urgent: false,
  },
  'task.deadline': {
    channels: { inApp: true, push: true, email: true, sms: false, whatsapp: false },
    urgent: false,
  },
  'guest.reminder': {
    channels: { inApp: true, push: false, email: true, sms: false, whatsapp: true },
    urgent: false,
  },
  'payment.received': {
    channels: { inApp: true, push: true, email: true, sms: false, whatsapp: false },
    urgent: false,
  },
  'payment.failed': { channels: { ...ALL_ON }, urgent: true },
  'day.item_late': { channels: { ...ALL_ON }, urgent: true },
  'day.incident_raised': { channels: { ...ALL_ON }, urgent: true },
  'day.signoff_due': {
    channels: { inApp: true, push: true, email: true, sms: false, whatsapp: false },
    urgent: false,
  },
};

const FALLBACK_DEF: NotifyTypeDef = {
  channels: { inApp: true, push: true, email: false, sms: false, whatsapp: false },
  urgent: false,
};

/** Lagos wall-clock minutes (WAT is UTC+1, no daylight saving). */
export function lagosMinutes(now: Date = new Date()): number {
  const shifted = new Date(now.getTime() + 60 * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Inside a quiet window? Overnight windows (start > end) wrap midnight. */
export function inQuietHours(nowMinutes: number, start: number | null, end: number | null): boolean {
  if (start === null || end === null || start === end) return false;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

export interface ResolveInput {
  /** Per-type user overrides (partial); missing types use the registry. */
  overrides?: Record<string, Partial<ChannelPrefs>> | null;
  quietStart?: number | null;
  quietEnd?: number | null;
  /** Call-site escalation on top of the registry default. */
  urgent?: boolean | undefined;
  now?: Date;
}

/** Table-testable core of the pipeline (GATE P13): registry defaults merged
 * with user overrides, then quiet hours, then the urgent override. */
export function resolveChannels(type: string, input: ResolveInput = {}): ChannelPrefs {
  const def = NOTIFY_TYPES[type] ?? FALLBACK_DEF;
  const urgent = input.urgent ?? def.urgent;
  const override = input.overrides?.[type] ?? {};
  const channels: ChannelPrefs = { ...def.channels, ...override };
  if (urgent) {
    // MSG-16: urgent alerts use SMS/WhatsApp and ignore quiet hours.
    channels.sms = true;
    channels.whatsapp = true;
    return channels;
  }
  if (inQuietHours(lagosMinutes(input.now), input.quietStart ?? null, input.quietEnd ?? null)) {
    return { inApp: channels.inApp, push: false, email: false, sms: false, whatsapp: false };
  }
  return channels;
}

export const notifySchema = z.object({
  userId: z.string().uuid(),
  type: z.string().min(1).max(80),
  title: z.string().trim().min(1, 'titleRequired').max(200, 'titleTooLong'),
  body: z.string().trim().min(1, 'titleRequired').max(1000, 'notesTooLong'),
  url: z.string().trim().min(1).max(500),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  urgent: z.boolean().optional(),
});

/** Fan a notification out (P13-T03). Called with the system actor from
 * worker jobs and server code paths that already authorized the trigger.
 * Always records the in-app row (history); `inApp: false` marks it read so
 * it never lights the bell. Remote channels ride the outbox. */
export async function notify(
  _actor: SystemActor | Extract<Actor, { kind: 'user' }>,
  raw: z.input<typeof notifySchema>,
) {
  const input = notifySchema.parse(raw);
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) throw new NotFoundError('User not found');
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId: input.userId } });
  const overrides = prefs ? (prefs.channels as Record<string, Partial<ChannelPrefs>> | null) : null;
  const channels = resolveChannels(input.type, {
    overrides,
    quietStart: prefs?.quietStart ?? null,
    quietEnd: prefs?.quietEnd ?? null,
    urgent: input.urgent,
  });
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.notification.create({
      data: {
        id: uuidv7(),
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        url: input.url,
        data: input.data ?? {},
        ...(channels.inApp ? {} : { readAt: new Date() }),
      },
      select: { id: true },
    });
    if (channels.push || channels.email || channels.sms || channels.whatsapp) {
      await enqueue(tx, 'messaging/notify', { notificationId: created.id, urgent: input.urgent ?? false });
    }
    return created;
  });
  return { notificationId: row.id, channels };
}

/** The worker re-resolves at send time so late preference edits win; the
 * urgent hint travels on the outbox payload (the registry alone can't know
 * a call-site escalation). */
export async function resolveSendChannels(
  notificationId: string,
  urgentHint = false,
  now: Date = new Date(),
): Promise<{ id: string; userId: string; type: string; title: string; body: string; url: string; channels: ChannelPrefs; urgent: boolean } | null> {
  const row = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true, type: true, title: true, body: true, url: true },
  });
  if (!row) return null;
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId: row.userId } });
  const urgent = urgentHint || (NOTIFY_TYPES[row.type]?.urgent ?? false);
  const overrides = prefs ? (prefs.channels as Record<string, Partial<ChannelPrefs>> | null) : null;
  const channels = resolveChannels(row.type, {
    overrides,
    quietStart: prefs?.quietStart ?? null,
    quietEnd: prefs?.quietEnd ?? null,
    urgent,
    now,
  });
  return { ...row, channels, urgent };
}

export const listNotificationsSchema = z.object({
  unreadOnly: z.boolean().optional(),
  take: z.number().int().min(1).max(100).optional(),
});

export async function listNotifications(actor: UserActor, raw: z.input<typeof listNotificationsSchema> = {}) {
  const input = listNotificationsSchema.parse(raw);
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: actor.userId, ...(input.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: input.take ?? 30,
    }),
    prisma.notification.count({ where: { userId: actor.userId, readAt: null } }),
  ]);
  return {
    rows: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      url: row.url,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    unread,
  };
}

export const markReadSchema = z.object({ notificationId: z.string().uuid() });

export async function markNotificationRead(actor: UserActor, raw: z.input<typeof markReadSchema>) {
  const input = markReadSchema.parse(raw);
  const row = await prisma.notification.findFirst({ where: { id: input.notificationId, userId: actor.userId } });
  if (!row) throw new NotFoundError('Notification not found');
  await prisma.notification.update({ where: { id: row.id }, data: { readAt: new Date() } });
  return { ok: true as const };
}

export async function markAllNotificationsRead(actor: UserActor) {
  await prisma.notification.updateMany({ where: { userId: actor.userId, readAt: null }, data: { readAt: new Date() } });
  return { ok: true as const };
}

/** Bell badge count (single cheap query, used by the app frame). */
export async function notificationUnreadCount(actor: UserActor): Promise<number> {
  return prisma.notification.count({ where: { userId: actor.userId, readAt: null } });
}

const channelSchema = z.boolean();

export const setPreferencesSchema = z.object({
  channels: z.record(z.string().max(80), z.object({
    inApp: channelSchema.optional(),
    push: channelSchema.optional(),
    email: channelSchema.optional(),
    sms: channelSchema.optional(),
    whatsapp: channelSchema.optional(),
  })).optional(),
  quietStart: z.number().int().min(0).max(1439).nullable().optional(),
  quietEnd: z.number().int().min(0).max(1439).nullable().optional(),
});

/** Unknown types are rejected so typos can't silently disable a channel. */
export async function setPreferences(actor: UserActor, raw: z.input<typeof setPreferencesSchema>) {
  const input = setPreferencesSchema.parse(raw);
  if (input.channels) {
    const unknown = Object.keys(input.channels).filter((type) => !(type in NOTIFY_TYPES));
    if (unknown.length > 0) throw new ValidationError('Unknown notification type', { field: 'channels' });
  }
  const row = await prisma.notificationPreference.upsert({
    where: { userId: actor.userId },
    create: {
      userId: actor.userId,
      channels: input.channels ?? {},
      ...(input.quietStart !== undefined ? { quietStart: input.quietStart } : {}),
      ...(input.quietEnd !== undefined ? { quietEnd: input.quietEnd } : {}),
    },
    update: {
      ...(input.channels !== undefined ? { channels: input.channels } : {}),
      ...(input.quietStart !== undefined ? { quietStart: input.quietStart } : {}),
      ...(input.quietEnd !== undefined ? { quietEnd: input.quietEnd } : {}),
    },
  });
  return {
    channels: row.channels,
    quietStart: row.quietStart,
    quietEnd: row.quietEnd,
  };
}

export async function getPreferences(actor: UserActor) {
  const row = await prisma.notificationPreference.findUnique({ where: { userId: actor.userId } });
  return {
    channels: (row?.channels ?? {}) as Record<string, Partial<ChannelPrefs>>,
    quietStart: row?.quietStart ?? null,
    quietEnd: row?.quietEnd ?? null,
    types: NOTIFY_TYPES,
  };
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(500),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(100) }),
});

export async function registerPushSubscription(actor: UserActor, raw: z.input<typeof pushSubscriptionSchema>) {
  const input = pushSubscriptionSchema.parse(raw);
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { id: uuidv7(), userId: actor.userId, endpoint: input.endpoint, keys: input.keys },
    update: { userId: actor.userId, keys: input.keys },
  });
  return { ok: true as const };
}

export const unregisterPushSchema = z.object({ endpoint: z.string().max(500) });

export async function unregisterPushSubscription(actor: UserActor, raw: z.input<typeof unregisterPushSchema>) {
  const input = unregisterPushSchema.parse(raw);
  await prisma.pushSubscription.deleteMany({ where: { endpoint: input.endpoint, userId: actor.userId } });
  return { ok: true as const };
}
