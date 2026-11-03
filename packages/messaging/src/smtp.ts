import { isPlaceholderEmail } from './email-address.js';
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
      // Fail fast instead of hanging a request (D-X53).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    transports.set(key, transport);
  }
  return transport;
}

/** Connection-level failures worth one retry on a fresh connection (e.g. the
 * pooled socket went stale after the machine changed networks). */
const RETRYABLE = new Set(['ESOCKET', 'ECONNECTION', 'ETIMEDOUT', 'EADDRNOTAVAIL', 'ECONNRESET', 'EDNS']);

function dropTransport(config: SmtpConfig) {
  const key = `${config.host}:${config.port}:${config.user}`;
  transports.get(key)?.close();
  transports.delete(key);
}

/** Send already-rendered HTML (+ plain text) over SMTP; returns the Message-ID. */
export async function sendSmtp(
  config: SmtpConfig,
  message: { to: string; subject: string; html: string; text?: string | undefined },
): Promise<string> {
  const mail = {
    from: config.from,
    to: message.to,
    replyTo: config.from,
    subject: message.subject,
    html: message.html,
    ...(message.text ? { text: message.text } : {}),
    headers: {
      // Unique per send so Gmail never folds separate codes/links into one thread.
      'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      // Transactional mail: ask auto-responders not to answer it.
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
    },
  };
  let info;
  try {
    info = await smtpTransport(config).sendMail(mail);
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    if (!RETRYABLE.has(code)) throw error;
    dropTransport(config);
    info = await smtpTransport(config).sendMail(mail);
  }
  if (info.rejected.length > 0) throw new Error(`SMTP rejected ${message.to}`);
  return info.messageId;
}

export class SmtpEmail implements EmailProvider {
  readonly kind = 'smtp';

  constructor(private readonly config: SmtpConfig) {}

  async send(message: EmailSendInput): Promise<EmailSendResult> {
    // Placeholder addresses are not mailboxes; skip instead of bouncing (D-X56).
    if (isPlaceholderEmail(message.to)) return { id: 'skipped-placeholder' };
    const [html, text] = await Promise.all([render(message.react), render(message.react, { plainText: true })]);
    return { id: await sendSmtp(this.config, { to: message.to, subject: message.subject, html, text }) };
  }
}
