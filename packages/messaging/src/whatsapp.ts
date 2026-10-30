import { createHmac, timingSafeEqual } from 'node:crypto';

// WhatsApp Cloud API (bulk mode, flag `whatsapp.bulk`) behind one interface
// (Backend.md §9). Free mode needs no provider — see wame.ts. Webhook
// verification + parsing live here so the route handler (P4-T10) stays thin.

export interface WhatsAppTemplateInput {
  /** E.164, e.g. "+2348012345678". */
  to: string;
  /** Approved template name, e.g. "tiwa_invite_v1". */
  template: string;
  lang: string;
  /** `{{1}}`, `{{2}}`, … body parameters in order. */
  params: string[];
  /** Quick-reply buttons (max 3); payloads come back in the webhook. */
  buttons?: { id: string; title: string }[] | undefined;
}

export interface WhatsAppSendResult {
  id: string;
}

export interface WhatsAppProvider {
  readonly kind: string;
  sendTemplate(message: WhatsAppTemplateInput): Promise<WhatsAppSendResult>;
}

export interface CloudWhatsAppConfig {
  token: string;
  phoneNumberId: string;
  graphVersion?: string | undefined;
}

export class CloudWhatsApp implements WhatsAppProvider {
  readonly kind = 'cloud';

  constructor(private readonly config: CloudWhatsAppConfig) {}

  async sendTemplate(message: WhatsAppTemplateInput): Promise<WhatsAppSendResult> {
    const version = this.config.graphVersion ?? 'v21.0';
    const components: Record<string, unknown>[] = [
      { type: 'body', parameters: message.params.map((text) => ({ type: 'text', text })) },
    ];
    if (message.buttons?.length) {
      for (const [index, button] of message.buttons.entries()) {
        components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [] });
        void button;
      }
    }
    const response = await fetch(`https://graph.facebook.com/${version}/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.to.replace(/^\+/, ''),
        type: 'template',
        template: { name: message.template, language: { code: message.lang }, components },
      }),
    });
    if (!response.ok) throw new Error(`WhatsApp send failed: HTTP ${response.status}`);
    const data = (await response.json()) as { messages?: { id?: string }[] };
    const id = data.messages?.[0]?.id;
    if (!id) throw new Error('WhatsApp send failed: no message id returned');
    return { id };
  }
}

export interface FakeSentTemplate extends WhatsAppTemplateInput {
  id: string;
}

export class FakeWhatsApp implements WhatsAppProvider {
  readonly kind = 'fake';
  readonly sent: FakeSentTemplate[] = [];

  async sendTemplate(message: WhatsAppTemplateInput): Promise<WhatsAppSendResult> {
    const id = `fake-wa-${this.sent.length + 1}`;
    this.sent.push({ ...message, id });
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[whatsapp:fake] to=${message.to} template=${message.template}`);
    }
    return { id };
  }

  clear(): void {
    this.sent.length = 0;
  }
}

// ───────────── Webhooks ─────────────

export type WaDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export type WaEvent =
  | {
      kind: 'status';
      messageId: string;
      status: WaDeliveryStatus;
      recipient: string;
      error?: string | undefined;
    }
  | { kind: 'reply'; from: string; messageId: string; payload: string; text: string };

/** Verifies Meta's `X-Hub-Signature-256: sha256=<hex>` over the raw body. */
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  const actual = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

interface WaWebhookBody {
  entry?: {
    changes?: {
      value?: {
        statuses?: {
          id?: string;
          recipient_id?: string;
          status?: string;
          errors?: { error_data?: { details?: string }; message?: string }[];
        }[];
        messages?: {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          button?: { payload?: string; text?: string };
          interactive?: { button_reply?: { id?: string; title?: string } };
        }[];
      };
    }[];
  }[];
}

/**
 * Parses delivery receipts and reply-button taps from a verified webhook
 * payload. Unknown shapes are skipped (Meta adds fields without warning);
 * the route rejects unverified bodies before calling this.
 */
export function parseWhatsAppWebhook(body: unknown): WaEvent[] {
  const events: WaEvent[] = [];
  const payload = body as WaWebhookBody;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      for (const status of value.statuses ?? []) {
        if (!status.id || !status.status) continue;
        const mapped = status.status as WaDeliveryStatus;
        if (mapped !== 'sent' && mapped !== 'delivered' && mapped !== 'read' && mapped !== 'failed') continue;
        events.push({
          kind: 'status',
          messageId: status.id,
          status: mapped,
          recipient: status.recipient_id ?? '',
          error: status.errors?.[0]?.message ?? status.errors?.[0]?.error_data?.details,
        });
      }
      for (const message of value.messages ?? []) {
        if (!message.id || !message.from) continue;
        const payloadId =
          message.interactive?.button_reply?.id ?? (message.type === 'button' ? message.button?.payload : undefined);
        if (!payloadId) continue;
        events.push({
          kind: 'reply',
          from: message.from,
          messageId: message.id,
          payload: payloadId,
          text: message.interactive?.button_reply?.title ?? message.button?.text ?? '',
        });
      }
    }
  }
  return events;
}
