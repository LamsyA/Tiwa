import webPush from 'web-push';

// Web push (P13-T03): VAPID via `web-push`. FakePush records for tests and
// for local runs without VAPID keys.

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushSendInput {
  subscription: PushSubscriptionJSON;
  title: string;
  body: string;
  url: string;
  urgent?: boolean;
}

export interface PushSendResult {
  ok: boolean;
  /** The subscription is dead (410/404) — delete it. */
  gone?: boolean;
  providerMessageId?: string;
}

export interface PushProvider {
  readonly kind: string;
  send(input: PushSendInput): Promise<PushSendResult>;
}

export class FakePush implements PushProvider {
  readonly kind = 'fake';
  readonly sent: PushSendInput[] = [];

  async send(input: PushSendInput): Promise<PushSendResult> {
    this.sent.push(input);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[push:fake] title=${input.title} endpoint=${input.subscription.endpoint.slice(0, 48)}…`);
    }
    return { ok: true };
  }
}

export interface WebPushConfig {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  subject?: string;
}

export class WebPush implements PushProvider {
  readonly kind = 'web-push';

  constructor(config: WebPushConfig) {
    webPush.setVapidDetails(config.subject ?? 'mailto:hello@tiwa.app', config.vapidPublicKey, config.vapidPrivateKey);
  }

  async send(input: PushSendInput): Promise<PushSendResult> {
    try {
      await webPush.sendNotification(
        input.subscription as webPush.PushSubscription,
        JSON.stringify({ title: input.title, body: input.body, url: input.url }),
        { urgency: input.urgent ? 'high' : 'normal', TTL: input.urgent ? 3600 : 4 * 3600 },
      );
      return { ok: true };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return { ok: false, gone: true };
      throw error;
    }
  }
}
