import { prisma } from '@tiwa/db';
import { env } from '@tiwa/config';
import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { magicLink } from 'better-auth/plugins/magic-link';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import {
  EmailSender,
  ResendEmailSender,
  FakeEmailSender,
  FakeSmsSender,
  SmsSender,
  TermiiSmsSender,
} from './senders.js';

// Wired by provider (Fake default). Tests inject their own instances.
export const smsSender: SmsSender = env.SMS_PROVIDER === 'termii' ? new TermiiSmsSender() : new FakeSmsSender();
export const emailSender: EmailSender =
  env.EMAIL_PROVIDER === 'resend' ? new ResendEmailSender() : new FakeEmailSender();

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const options = {
  secret: env.AUTH_SECRET ?? 'dev-only-secret-change-me-in-production-000000',
  baseURL: env.APP_URL,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: false },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : {},
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }) => {
        await smsSender.send({
          to: phoneNumber,
          body: `Your Tiwa verification code is ${code}. It expires in 5 minutes.`,
        });
      },
      signUpOnVerification: {
        getTempEmail: (phoneNumber: string) => `${phoneNumber.replace(/\+/g, '')}@phone.tiwa.local`,
        getTempName: (phoneNumber: string) => phoneNumber,
      },
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await emailSender.send({
          to: email,
          subject: 'Sign in to Tiwa',
          html: `<p>Click the link below to sign in to Tiwa. It expires in 15 minutes.</p><p><a href="${url}">Sign in</a></p>`,
        });
      },
      expiresIn: 900,
    }),
  ],
  // Backend.md §12: 30-day sliding sessions (refreshed at most daily). Cookies are
  // httpOnly + SameSite=Lax always, and Secure whenever APP_URL is https.
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
} satisfies BetterAuthOptions;

export const authOptions = options;

export const auth: Auth<typeof options> = betterAuth(options);

export type AuthSession = typeof auth.$Infer.Session;
