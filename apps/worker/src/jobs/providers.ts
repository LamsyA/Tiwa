import { env } from '@tiwa/config';
import {
  CloudWhatsApp,
  FakeEmail,
  FakeSms,
  FakeWhatsApp,
  ResendEmail,
  TermiiSms,
  type EmailProvider,
  type SmsProvider,
  type WhatsAppProvider,
} from '@tiwa/messaging';

// Provider singletons for send jobs. Fakes by default (local/test);
// real providers when their env is configured.

export interface Providers {
  email: EmailProvider;
  sms: SmsProvider;
  whatsapp: WhatsAppProvider;
}

const globalProviders = globalThis as unknown as { __tiwaProviders?: Providers };

export function providers(): Providers {
  globalProviders.__tiwaProviders ??= {
    email:
      env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY
        ? new ResendEmail({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
        : new FakeEmail({ mailpitUrl: process.env.MAILPIT_URL }),
    sms:
      env.SMS_PROVIDER === 'termii' && env.TERMII_API_KEY
        ? new TermiiSms({ apiKey: env.TERMII_API_KEY, senderId: env.TERMII_SENDER_ID })
        : new FakeSms(),
    whatsapp:
      env.WHATSAPP_PROVIDER === 'cloud' && env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
        ? new CloudWhatsApp({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID })
        : new FakeWhatsApp(),
  };
  return globalProviders.__tiwaProviders;
}

/** Tests inject fakes and read `.sent` back. */
export function setProvidersForTests(next: Providers): void {
  globalProviders.__tiwaProviders = next;
}
