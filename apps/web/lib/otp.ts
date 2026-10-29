import { prisma } from '@tiwa/db';
import { RateLimitedError, ValidationError } from '@tiwa/core';
import { LOGIN_KEY, OTP_LIMITS, checkRedisRateLimit, clearRateLimit } from './rate-store.js';
import { auth } from './auth.js';

function e164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  const normalized = digits.startsWith('+') ? digits : `+${digits}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new ValidationError('Enter a valid phone number', { field: 'phone' });
  }
  return normalized;
}

/** Step 1: send a 6-digit code. Rate-limited per Backend.md §13. */
export async function requestOtp(rawPhone: string, ip: string): Promise<{ ok: true }> {
  const phone = e164(rawPhone);
  for (const [key, rule] of OTP_LIMITS(phone, ip)) {
    const result = await checkRedisRateLimit(key, rule.limit, rule.windowSec);
    if (!result.allowed) throw new RateLimitedError('Too many codes sent — try again shortly');
  }
  await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } });
  return { ok: true };
}

export interface VerifyResult {
  userId: string;
  newUser: boolean;
}

/** Step 2: verify the code. 5 wrong tries lock the number for 15 min (UF-01-4). */
export async function verifyOtp(rawPhone: string, code: string, ip: string): Promise<VerifyResult> {
  const phone = e164(rawPhone);
  const login = await checkRedisRateLimit(LOGIN_KEY(ip), 10, 600);
  if (!login.allowed) throw new RateLimitedError('Too many attempts — try again shortly');
  const verify = await checkRedisRateLimit(`otp:verify:${phone}`, 5, 900);
  if (!verify.allowed) {
    throw new RateLimitedError('Too many wrong codes — this number is locked for 15 minutes', {
      retryAfterSec: verify.retryAfterSec,
    });
  }
  let result: { user?: { id?: string } | null; newUser?: boolean } | null;
  try {
    result = (await auth.api.verifyPhoneNumber({
      body: { phoneNumber: phone, code: code.trim() },
    })) as typeof result;
  } catch {
    throw new ValidationError('That code is wrong or expired', { field: 'code' });
  }
  const userId = result?.user?.id;
  if (!userId) throw new ValidationError('That code is wrong or expired', { field: 'code' });
  // Mirror the verified number onto our canonical contact fields.
  await prisma.user.update({
    where: { id: userId },
    data: { phone, phoneVerified: true },
  });
  await clearRateLimit(`otp:verify:${phone}`);
  return { userId, newUser: result?.newUser ?? false };
}

/** Magic-link send (rate-limited like a login attempt). */
export async function sendMagicLink(rawEmail: string, ip: string, callbackURL = '/'): Promise<{ ok: true }> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ValidationError('Enter a valid email address', { field: 'email' });
  }
  const login = await checkRedisRateLimit(LOGIN_KEY(ip), 10, 600);
  if (!login.allowed) throw new RateLimitedError('Too many attempts — try again shortly');
  await auth.api.signInMagicLink({ body: { email, callbackURL }, headers: new Headers() });
  return { ok: true };
}
