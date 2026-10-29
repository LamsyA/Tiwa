// Outbound messaging senders (P2-T02). Fake captures for tests; Termii and
// Resend are used when their keys are present. Mailpit stays available for
// manual inspection; SMTP wiring lands with packages/messaging in P13.
import { env } from '@tiwa/config';

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsSender {
  readonly kind: string;
  send(message: SmsMessage): Promise<{ providerRef: string | undefined }>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSender {
  readonly kind: string;
  send(message: EmailMessage): Promise<{ providerRef: string | undefined }>;
}

/**
 * Messages captured by the Fake senders, shared across module instances (Next
 * can load a module once per route bundle). Read by the e2e test hook only.
 */
export interface CapturedMessage {
  channel: 'sms' | 'email';
  to: string;
  body: string;
  at: number;
}

const globalOutbox = globalThis as unknown as { __tiwaFakeOutbox?: CapturedMessage[] };

export function fakeOutbox(): CapturedMessage[] {
  return (globalOutbox.__tiwaFakeOutbox ??= []);
}

function capture(message: CapturedMessage) {
  const outbox = fakeOutbox();
  outbox.push(message);
  if (outbox.length > 200) outbox.splice(0, outbox.length - 200);
}

export class FakeSmsSender implements SmsSender {
  readonly kind = 'fake';
  readonly sent: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<{ providerRef: string | undefined }> {
    this.sent.push(message);
    capture({ channel: 'sms', to: message.to, body: message.body, at: Date.now() });
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[sms:fake] to=${message.to} body=${message.body}`);
    }
    return { providerRef: `fake-${this.sent.length}` };
  }
}

export class TermiiSmsSender implements SmsSender {
  readonly kind = 'termii';

  async send(message: SmsMessage): Promise<{ providerRef: string | undefined }> {
    if (!env.TERMII_API_KEY) throw new Error('TERMII_API_KEY is not set');
    const response = await fetch('https://api.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: env.TERMII_API_KEY,
        to: message.to.replace(/^\+/, ''),
        from: env.TERMII_SENDER_ID,
        sms: message.body,
        type: 'plain',
        channel: 'generic',
      }),
    });
    if (!response.ok) {
      throw new Error(`Termii send failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as { message_id?: string };
    return { providerRef: data.message_id };
  }
}

export class FakeEmailSender implements EmailSender {
  readonly kind = 'fake';
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<{ providerRef: string | undefined }> {
    this.sent.push(message);
    capture({ channel: 'email', to: message.to, body: message.html, at: Date.now() });
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[email:fake] to=${message.to} subject=${message.subject}`);
    }
    return { providerRef: `fake-${this.sent.length}` };
  }
}

export class ResendEmailSender implements EmailSender {
  readonly kind = 'resend';

  async send(message: EmailMessage): Promise<{ providerRef: string | undefined }> {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html }),
    });
    if (!response.ok) {
      throw new Error(`Resend send failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as { id?: string };
    return { providerRef: data.id };
  }
}
