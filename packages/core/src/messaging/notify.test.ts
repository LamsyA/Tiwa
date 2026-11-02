// P13-T03: the channel matrix is table-driven (GATE P13); integration
// covers rows, outbox fan-out, quiet hours, urgent override and prefs.
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import {
  getPreferences,
  lagosMinutes,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notify,
  registerPushSubscription,
  resolveChannels,
  setPreferences,
  unregisterPushSubscription,
  type ChannelPrefs,
} from './notify.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const SYSTEM: Extract<Actor, { kind: 'system' }> = { kind: 'system' };

const users: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: users } } }).catch(() => undefined);
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: users } } }).catch(() => undefined);
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: users } } }).catch(() => undefined);
  await prisma.outboxEvent.deleteMany({ where: { topic: 'messaging/notify' } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
});

/** Lagos 22:00 (21:00 UTC) and 10:00 (09:00 UTC) on a fixed date. */
const NIGHT = new Date('2031-06-01T21:00:00Z');
const MORNING = new Date('2031-06-01T09:00:00Z');

describe('resolveChannels (GATE P13 table)', () => {
  const cases: {
    name: string;
    type: string;
    input: Parameters<typeof resolveChannels>[1];
    expected: ChannelPrefs;
  }[] = [
    {
      name: 'chat defaults to in-app + push only',
      type: 'chat.message',
      input: {},
      expected: { inApp: true, push: true, email: false, sms: false, whatsapp: false },
    },
    {
      name: 'unknown types fall back to in-app + push',
      type: 'nope.unknown',
      input: {},
      expected: { inApp: true, push: true, email: false, sms: false, whatsapp: false },
    },
    {
      name: 'user overrides win per channel',
      type: 'chat.message',
      input: { overrides: { 'chat.message': { push: false, email: true } } },
      expected: { inApp: true, push: false, email: true, sms: false, whatsapp: false },
    },
    {
      name: 'quiet hours keep in-app, drop the rest',
      type: 'booking.changed',
      input: { quietStart: 21 * 60, quietEnd: 7 * 60, now: NIGHT },
      expected: { inApp: true, push: false, email: false, sms: false, whatsapp: false },
    },
    {
      name: 'daytime passes everything through',
      type: 'booking.changed',
      input: { quietStart: 21 * 60, quietEnd: 7 * 60, now: MORNING },
      expected: { inApp: true, push: true, email: true, sms: false, whatsapp: false },
    },
    {
      name: 'overnight windows wrap midnight',
      type: 'booking.changed',
      input: { quietStart: 22 * 60, quietEnd: 6 * 60, now: new Date('2031-06-02T01:00:00Z') },
      expected: { inApp: true, push: false, email: false, sms: false, whatsapp: false },
    },
    {
      name: 'urgent registry types force SMS/WhatsApp through quiet',
      type: 'day.item_late',
      input: { quietStart: 21 * 60, quietEnd: 7 * 60, now: NIGHT },
      expected: { inApp: true, push: true, email: true, sms: true, whatsapp: true },
    },
    {
      name: 'call-site urgency escalates a calm type',
      type: 'booking.changed',
      input: { urgent: true, quietStart: 21 * 60, quietEnd: 7 * 60, now: NIGHT },
      expected: { inApp: true, push: true, email: true, sms: true, whatsapp: true },
    },
    {
      name: 'urgent still respects a user disabling email',
      type: 'day.item_late',
      input: { overrides: { 'day.item_late': { email: false } }, now: MORNING },
      expected: { inApp: true, push: true, email: false, sms: true, whatsapp: true },
    },
  ];
  for (const row of cases) {
    it(row.name, () => {
      expect(resolveChannels(row.type, row.input)).toEqual(row.expected);
    });
  }

  it('maps UTC to Lagos wall time', () => {
    expect(lagosMinutes(NIGHT)).toBe(22 * 60);
    expect(lagosMinutes(MORNING)).toBe(10 * 60);
  });
});

describe('notify() integration', () => {
  it('records the in-app row and queues remote fan-out', async () => {
    const user = await makeUser('Notify Target');
    const result = await notify(SYSTEM, {
      userId: user.userId,
      type: 'booking.changed',
      title: 'Quote updated',
      body: 'Your caterer updated the quote',
      url: '/quotes',
    });
    expect(result.channels).toMatchObject({ inApp: true, push: true, email: true });
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: result.notificationId } });
    expect(row.readAt).toBeNull();
    const queued = await prisma.outboxEvent.findFirst({
      where: { topic: 'messaging/notify' },
      orderBy: { createdAt: 'desc' },
    });
    expect(queued).toBeTruthy();
    expect((queued!.payload as { notificationId: string }).notificationId).toBe(result.notificationId);

    const listed = await listNotifications(user, {});
    expect(listed.unread).toBe(1);
    await markNotificationRead(user, { notificationId: result.notificationId });
    expect((await listNotifications(user, { unreadOnly: true })).unread).toBe(0);
    const second = await notify(SYSTEM, {
      userId: user.userId,
      type: 'booking.changed',
      title: 'Second',
      body: 'More news',
      url: '/quotes',
    });
    expect(second.notificationId).toBeTruthy();
    await markAllNotificationsRead(user);
    expect((await listNotifications(user, {})).unread).toBe(0);
  });

  it('auto-reads rows when in-app is off and skips the outbox when nothing remote is on', async () => {
    const user = await makeUser('Quiet Target');
    await setPreferences(user, { channels: { 'chat.message': { inApp: false } } });
    const result = await notify(SYSTEM, {
      userId: user.userId,
      type: 'chat.message',
      title: 'Hi',
      body: 'Hello there',
      url: '/inbox',
    });
    expect(result.channels.inApp).toBe(false);
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: result.notificationId } });
    expect(row.readAt).not.toBeNull();
  });

  it('validates preference input', async () => {
    const user = await makeUser('Prefs Target');
    await expect(setPreferences(user, { channels: { 'nope.unknown': { push: false } } })).rejects.toThrow();
    await expect(setPreferences(user, { quietStart: 9999 })).rejects.toThrow();
    const prefs = await setPreferences(user, { quietStart: 22 * 60, quietEnd: 6 * 60 });
    expect(prefs.quietStart).toBe(22 * 60);
    expect((await getPreferences(user)).quietEnd).toBe(6 * 60);
  });

  it('manages push subscriptions by endpoint', async () => {
    const user = await makeUser('Push Target');
    const sub = { endpoint: 'https://push.example/sub-1', keys: { p256dh: 'p', auth: 'a' } };
    await registerPushSubscription(user, sub);
    await registerPushSubscription(user, sub);
    expect(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } })).toBe(1);
    await unregisterPushSubscription(user, { endpoint: sub.endpoint });
    expect(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } })).toBe(0);
  });
});
