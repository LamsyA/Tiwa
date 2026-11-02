import { notify } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { FakeEmail, FakePush, FakeSms, FakeWhatsApp } from '@tiwa/messaging';
import { afterAll, describe, expect, it } from 'vitest';
import { handleNotify } from './notify.js';
import { setProvidersForTests } from './providers.js';
import { createLogger } from '@tiwa/core';

// P13-T03: the worker fans out across channels, skips missing contacts,
// and deletes dead push subscriptions. Fakes; no network.
const log = createLogger('test');
const SYSTEM = { kind: 'system' } as const;
const users: string[] = [];

async function makeUser(name: string, contact: { email?: string; phone?: string }) {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG', ...contact } });
  users.push(user.id);
  return user.id;
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: users } } }).catch(() => undefined);
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: users } } }).catch(() => undefined);
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: users } } }).catch(() => undefined);
  await prisma.outboxEvent.deleteMany({ where: { topic: 'messaging/notify' } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
});

describe('messaging/notify (P13-T03)', () => {
  it('sends push + email + sms + whatsapp when everything is on and present', async () => {
    const userId = await makeUser('Full Contact', { email: 'full@example.com', phone: '+2348012345678' });
    const email = new FakeEmail();
    const sms = new FakeSms();
    const whatsapp = new FakeWhatsApp();
    const push = new FakePush();
    setProvidersForTests({ email, sms, whatsapp, push });
    await prisma.pushSubscription.create({
      data: { userId, endpoint: 'https://push.example/full', keys: { p256dh: 'p', auth: 'a' } },
    });
    const { notificationId } = await notify(SYSTEM, {
      userId,
      type: 'day.item_late',
      title: 'Sound check is late',
      body: 'Running 20 minutes behind',
      url: '/events/x/day',
    });
    const result = await handleNotify({ notificationId }, log);
    expect(result.sent).toContain('push');
    expect(email.sent).toHaveLength(1);
    expect(sms.sent).toHaveLength(1);
    expect(whatsapp.sent).toHaveLength(1);
  });

  it('skips channels without contact details and deletes dead subscriptions', async () => {
    const userId = await makeUser('No Contact', {});
    const email = new FakeEmail();
    const sms = new FakeSms();
    const whatsapp = new FakeWhatsApp();
    const push = new FakePush();
    setProvidersForTests({ email, sms, whatsapp, push });
    await prisma.pushSubscription.create({
      data: { userId, endpoint: 'https://push.example/dead', keys: { p256dh: 'p', auth: 'a' } },
    });
    const { notificationId } = await notify(SYSTEM, {
      userId,
      type: 'day.item_late',
      title: 'Doors slipped',
      body: 'Ten minutes',
      url: '/events/x/day',
    });
    // Poison the fake to report a dead subscription.
    const realSend = push.send.bind(push);
    push.send = async (input) => {
      if (input.subscription.endpoint.endsWith('/dead')) return { ok: false, gone: true };
      return realSend(input);
    };
    const result = await handleNotify({ notificationId }, log);
    expect(result.sent).not.toContain('push');
    expect(result.skipped).toContain('push:gone');
    expect(result.skipped).toContain('email:no-address');
    expect(result.skipped).toContain('sms:no-number');
    expect(await prisma.pushSubscription.count({ where: { endpoint: 'https://push.example/dead' } })).toBe(0);
  });
});
