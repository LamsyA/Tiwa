import nodemailer, { type Transporter } from 'nodemailer';
import { render } from '@react-email/render';
import type { EmailProvider, EmailSendInput, EmailSendResult } from './email.js';

// SMTP email through Nodemailer (D-X52). The bridge until a domain is
// verified in Resend: Gmail with an app password can reach any recipient
// (about 500 a day). Same react-email templates, so mail looks identical.

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

const transports = new Map<string, Transporter>();

/** One pooled connection per account, reused across sends. */
export function smtpTransport(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user}`;
  let transport = transports.get(key);
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.password },
      pool: true,
      maxConnections: 3,
    });
    transports.set(key, transport);
  }
  return transport;
}

/** Send already-rendered HTML (+ plain text) over SMTP; returns the Message-ID. */
export async function sendSmtp(
  config: SmtpConfig,
  message: { to: string; subject: string; html: string; text?: string | undefined },
): Promise<string> {
  const info = await smtpTransport(config).sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    ...(message.text ? { text: message.text } : {}),
  });
  if (info.rejected.length > 0) throw new Error(`SMTP rejected ${message.to}`);
  return info.messageId;
}

export class SmtpEmail implements EmailProvider {
  readonly kind = 'smtp';

  constructor(private readonly config: SmtpConfig) {}

  async send(message: EmailSendInput): Promise<EmailSendResult> {
    const [html, text] = await Promise.all([render(message.react), render(message.react, { plainText: true })]);
    return { id: await sendSmtp(this.config, { to: message.to, subject: message.subject, html, text }) };
  }
}
