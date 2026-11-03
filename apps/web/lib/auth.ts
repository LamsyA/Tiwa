import { prisma } from '@tiwa/db';
import { env } from '@tiwa/config';
import { uuidv7 } from '@tiwa/core';
import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { renderSignInEmail } from '@tiwa/messaging';
import { magicLink } from 'better-auth/plugins/magic-link';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import { username } from 'better-auth/plugins/username';
import { authMethods } from './auth-methods.js';
import { recordResetOutcome } from './reset-outcome.js';
import {
  EmailSender,
  ResendEmailSender,
  SmtpEmailSender,
  FakeEmailSender,
  FakeSmsSender,
  SmsSender,
  TermiiSmsSender,
} from './senders.js';

// Wired by provider (Fake default). Tests inject their own instances.
export const smsSender: SmsSender = env.SMS_PROVIDER === 'termii' ? new TermiiSmsSender() : new FakeSmsSender();
export const emailSender: EmailSender =
  env.EMAIL_PROVIDER === 'resend'
    ? new ResendEmailSender()
    : env.EMAIL_PROVIDER === 'smtp'
      ? new SmtpEmailSender()
      : new FakeEmailSender();

// D-X50: Google is registered only when switched on and configured.
const googleConfigured = authMethods().google;

const options = {
  secret: env.AUTH_SECRET ?? 'dev-only-secret-change-me-in-production-000000',
  baseURL: env.APP_URL,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  // D-X50: username/email + password for everyone. Passwords are hashed by
  // Better Auth (scrypt); no email verification until a sending domain exists.
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: false,
    autoSignIn: true,
    // D-X51/D-X53: forgot password. Ten-minute link in the branded email; a
    // reset signs the account out everywhere.
    resetPasswordTokenExpiresIn: 10 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      const message = await renderSignInEmail({
        url,
        email: user.email,
        appUrl: env.APP_URL,
        expiresInMinutes: 10,
        purpose: 'reset',
      });
      try {
        await emailSender.send({ to: user.email, ...message });
        recordResetOutcome(user.email, true);
      } catch (error) {
        recordResetOutcome(user.email, false);
        throw error;
      }
    },
  },
  // D-A11: new users, sessions and accounts get UUID v7 ids like every other table.
  // (Accounts created before this keep Better Auth's 32-char ids; see core userIdSchema.)
  advanced: { database: { generateId: () => uuidv7() } },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : {},
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      // Letters, numbers, dots and underscores; no leading/trailing dot.
      usernameValidator: (value: string) => /^(?!\.)[a-zA-Z0-9._]+(?<!\.)$/.test(value),
    }),
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
        // D-X49: branded email; new addresses get the welcome wording.
        const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } });
        const message = await renderSignInEmail({
          url,
          email,
          appUrl: env.APP_URL,
          expiresInMinutes: 15,
          isNewAccount: !existing,
        });
        await emailSender.send({ to: email, ...message });
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
