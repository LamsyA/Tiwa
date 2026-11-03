import { env } from '@tiwa/config';
import {
  CloudWhatsApp,
  FakeEmail,
  FakePush,
  FakeSms,
  FakeWhatsApp,
  ResendEmail,
  SmtpEmail,
  TermiiSms,
  WebPush,
  type EmailProvider,
  type PushProvider,
  type SmsProvider,
  type WhatsAppProvider,
} from '@tiwa/messaging';

// Provider singletons for send jobs. Fakes by default (local/test);
// real providers when their env is configured.

export interface Providers {
  email: EmailProvider;
  sms: SmsProvider;
  whatsapp: WhatsAppProvider;
  push: PushProvider;
}

const globalProviders = globalThis as unknown as { __tiwaProviders?: Providers };

export function providers(): Providers {
  globalProviders.__tiwaProviders ??= {
    email:
      env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY
        ? new ResendEmail({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
        : env.EMAIL_PROVIDER === 'smtp' && env.SMTP_USER && env.SMTP_PASSWORD
          ? new SmtpEmail({
              host: env.SMTP_HOST,
              port: env.SMTP_PORT,
              user: env.SMTP_USER,
              password: env.SMTP_PASSWORD,
              from: env.EMAIL_FROM,
            })
          : new FakeEmail({ mailpitUrl: process.env.MAILPIT_URL }),
    sms:
      env.SMS_PROVIDER === 'termii' && env.TERMII_API_KEY
        ? new TermiiSms({ apiKey: env.TERMII_API_KEY, senderId: env.TERMII_SENDER_ID, channel: env.TERMII_CHANNEL })
        : new FakeSms(),
    whatsapp:
      env.WHATSAPP_PROVIDER === 'cloud' && env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
        ? new CloudWhatsApp({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID })
        : new FakeWhatsApp(),
    push:
      env.WEB_PUSH_VAPID_PUBLIC_KEY && env.WEB_PUSH_VAPID_PRIVATE_KEY
        ? new WebPush({
            vapidPublicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY,
            vapidPrivateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY,
          })
        : new FakePush(),
  };
  return globalProviders.__tiwaProviders;
}

/** Tests inject fakes and read `.sent` back. */
export function setProvidersForTests(next: Providers): void {
  globalProviders.__tiwaProviders = next;
}
