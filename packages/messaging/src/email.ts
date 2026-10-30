import { render } from '@react-email/render';
import type * as React from 'react';

// Email behind one interface (Backend.md §9). Callers pass a react-email
// element; the provider renders it to HTML. Real sends go through Resend's
// REST API; Fake records in memory for tests and (best-effort) injects into
// Mailpit so local mail can be inspected at :8025.

export interface EmailSendInput {
  to: string;
  subject: string;
  react: React.ReactElement;
  tags?: { name: string; value: string }[] | undefined;
}

export interface EmailSendResult {
  id: string;
}

export interface EmailProvider {
  readonly kind: string;
  send(message: EmailSendInput): Promise<EmailSendResult>;
}

export interface ResendEmailConfig {
  apiKey: string;
  from: string;
}

export class ResendEmail implements EmailProvider {
  readonly kind = 'resend';

  constructor(private readonly config: ResendEmailConfig) {}

  async send(message: EmailSendInput): Promise<EmailSendResult> {
    const html = await render(message.react);
    const text = await render(message.react, { plainText: true });
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.config.from,
        to: [message.to],
        subject: message.subject,
        html,
        text,
        ...(message.tags ? { tags: message.tags } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Resend send failed: HTTP ${response.status}`);
    const data = (await response.json()) as { id?: string };
    if (!data.id) throw new Error('Resend send failed: no id returned');
    return { id: data.id };
  }
}

export interface FakeEmailConfig {
  /** Base URL of Mailpit (e.g. http://localhost:8025); when set, every fake send is also injected for inspection. */
  mailpitUrl?: string | undefined;
}

export interface FakeSentEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  id: string;
}

export class FakeEmail implements EmailProvider {
  readonly kind = 'fake';
  readonly sent: FakeSentEmail[] = [];

  constructor(private readonly config: FakeEmailConfig = {}) {}

  async send(message: EmailSendInput): Promise<EmailSendResult> {
    const html = await render(message.react);
    const text = await render(message.react, { plainText: true });
    const id = `fake-email-${this.sent.length + 1}`;
    this.sent.push({ to: message.to, subject: message.subject, html, text, id });
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[email:fake] to=${message.to} subject=${message.subject}`);
    }
    await this.injectIntoMailpit(message.to, message.subject, html, text);
    return { id };
  }

  clear(): void {
    this.sent.length = 0;
  }

  /** Best-effort: Mailpit may not be running (CI) — never fail a send over it. */
  private async injectIntoMailpit(to: string, subject: string, html: string, text: string): Promise<void> {
    if (!this.config.mailpitUrl) return;
    try {
      await fetch(`${this.config.mailpitUrl}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Address: 'hello@tiwa.app', Name: 'Tiwa' },
          To: [{ Address: to }],
          Subject: subject,
          HTML: html,
          Text: text,
        }),
        signal: AbortSignal.timeout(1500),
      });
    } catch {
      // Inspection only — the in-memory record is the source of truth.
    }
  }
}
