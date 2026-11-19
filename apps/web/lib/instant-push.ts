import { env } from '@tiwa/config';
import { setInstantPush } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { FakePush, WebPush, type PushProvider } from '@tiwa/messaging';

// D-X106: push the moment a notification is created, from the web app,
// instead of waiting for the background worker. Email/SMS/WhatsApp still go
// through the worker as before.

let provider: PushProvider | null = null;
function push(): PushProvider {
  provider ??=
    env.WEB_PUSH_VAPID_PUBLIC_KEY && env.WEB_PUSH_VAPID_PRIVATE_KEY
      ? new WebPush({ vapidPublicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY, vapidPrivateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY })
      : new FakePush();
  return provider;
}

export async function sendPushNow(notificationId: string): Promise<void> {
  const row = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true, title: true, body: true, url: true },
  });
  if (!row) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: row.userId } });
  await Promise.all(
    subs.map(async (sub) => {
      const keys = sub.keys as { p256dh?: unknown; auth?: unknown } | null;
      if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') return;
      const result = await push()
        .send({
          subscription: { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
          title: row.title,
          body: row.body,
          url: row.url,
          urgent: false,
        })
        .catch(() => ({ ok: false, gone: false }));
      if (!result.ok && result.gone)
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
    }),
  );
}

export function registerInstantPush(): void {
  setInstantPush(sendPushNow);
}
