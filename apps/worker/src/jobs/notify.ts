import { createLogger, resolveSendChannels } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { env } from '@tiwa/config';
import { NotifyEmail } from '@tiwa/messaging';
import { providers } from './providers.js';

type Log = ReturnType<typeof createLogger>;

/** `messaging/notify` (P13-T03, Backend.md §10): re-resolves channels at
 * send time (prefs + quiet hours + urgent), then fans out. Missing contact
 * details skip that channel; dead push subscriptions are deleted. */
export const NOTIFY_TOPIC = 'messaging/notify' as const;

interface NotifyPayload {
  notificationId?: unknown;
  urgent?: unknown;
}

export async function handleNotify(
  data: unknown,
  log: Log,
): Promise<{ sent: string[]; skipped: string[]; notificationId: string }> {
  const payload = (data ?? {}) as NotifyPayload;
  if (typeof payload.notificationId !== 'string') throw new Error('messaging/notify needs a notificationId');
  const resolved = await resolveSendChannels(payload.notificationId, payload.urgent === true, new Date());
  if (!resolved) return { sent: [], skipped: ['missing'], notificationId: payload.notificationId };
  const { channels } = resolved;
  const sent: string[] = [];
  const skipped: string[] = [];

  if (!channels.push && !channels.email && !channels.sms && !channels.whatsapp) {
    return { sent, skipped: ['none-enabled'], notificationId: resolved.id };
  }

  const user = await prisma.user.findUnique({
    where: { id: resolved.userId },
    select: { name: true, email: true, phone: true },
  });
  if (!user) return { sent, skipped: ['no-user'], notificationId: resolved.id };
  const { email, sms, whatsapp, push } = providers();

  if (channels.push) {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: resolved.userId } });
    if (subs.length === 0) {
      skipped.push('push:no-subscription');
    }
    for (const sub of subs) {
      const keys = sub.keys as { p256dh?: unknown; auth?: unknown } | null;
      if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
        skipped.push('push:bad-subscription');
        continue;
      }
      const result = await push.send({
        subscription: { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
        title: resolved.title,
        body: resolved.body,
        url: resolved.url,
        urgent: resolved.urgent,
      });
      if (result.ok) {
        sent.push('push');
      } else if (result.gone) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
        skipped.push('push:gone');
      } else {
        skipped.push('push:failed');
      }
    }
  }

  if (channels.email) {
    if (!user.email) {
      skipped.push('email:no-address');
    } else {
      const result = await email.send({
        to: user.email,
        subject: resolved.title,
        react: NotifyEmail({ name: user.name, title: resolved.title, body: resolved.body, url: resolved.url }),
      });
      sent.push(`email:${result.id}`);
    }
  }

  if (channels.sms) {
    if (!user.phone) {
      skipped.push('sms:no-number');
    } else {
      const result = await sms.send({ to: user.phone, text: `${resolved.title} — ${resolved.body} ${resolved.url}` });
      sent.push(`sms:${result.id}`);
    }
  }

  if (channels.whatsapp) {
    if (!user.phone) {
      skipped.push('whatsapp:no-number');
    } else {
      const result = await whatsapp.sendTemplate({
        to: user.phone,
        template: env.WHATSAPP_NOTIFY_TEMPLATE,
        lang: 'en',
        params: [resolved.title, resolved.body],
      });
      sent.push(`whatsapp:${result.id}`);
    }
  }

  log.info(
    { topic: NOTIFY_TOPIC, notificationId: resolved.id, sent: sent.length, skipped },
    'notification fanned out',
  );
  return { sent, skipped, notificationId: resolved.id };
}
