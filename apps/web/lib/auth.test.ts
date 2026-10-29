import { prisma } from '@tiwa/db';
import { RateLimitedError } from '@tiwa/core';
import { afterAll, describe, expect, it } from 'vitest';
import { auth, emailSender, smsSender } from './auth.js';
import { requestOtp, sendMagicLink, verifyOtp } from './otp.js';
import type { FakeEmailSender, FakeSmsSender } from './senders.js';

const RUN = Math.floor(Math.random() * 100000);
const ip = (n: number | string) => `test-${RUN}-${n}`;
const sms = smsSender as FakeSmsSender;
const email = emailSender as FakeEmailSender;

function testPhone(): string {
  return `+234801${String(Math.floor(100000 + Math.random() * 899999))}`;
}

async function cleanupPhone(phone: string) {
  await prisma.session.deleteMany({ where: { user: { phone } } }).catch(() => undefined);
  await prisma.verification
    .deleteMany({ where: { identifier: { startsWith: `phone-number:${phone}` } } })
    .catch(() => undefined);
  await prisma.user.deleteMany({ where: { phone } }).catch(() => undefined);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('phone OTP flow', () => {
  it('sends a code, verifies it, and creates a session', async () => {
    const phone = testPhone();
    await requestOtp(phone, ip('1'));
    expect(sms.sent.length).toBeGreaterThan(0);
    const code = sms.sent[sms.sent.length - 1]?.body.match(/\d{6}/)?.[0];
    expect(code).toMatch(/^\d{6}$/);

    const result = await verifyOtp(phone, code as string, ip('1'));
    expect(typeof result.userId).toBe('string');

    const user = await prisma.user.findUnique({ where: { id: result.userId } });
    expect(user?.phoneVerified).toBe(true);
    expect(user?.phone).toBe(phone);
    const sessions = await prisma.session.findMany({ where: { userId: result.userId } });
    expect(sessions.length).toBeGreaterThan(0);
    await cleanupPhone(phone);
  });

  it('locks the number after 5 wrong codes (UF-01-4)', async () => {
    const phone = testPhone();
    await requestOtp(phone, ip('2'));
    for (let i = 0; i < 5; i += 1) {
      await expect(verifyOtp(phone, '000000', ip('2'))).rejects.toThrow('wrong or expired');
    }
    const correct = sms.sent[sms.sent.length - 1]?.body.match(/\d{6}/)?.[0] as string;
    await expect(verifyOtp(phone, correct, ip('2'))).rejects.toThrow(RateLimitedError);
    await cleanupPhone(phone);
  });

  it('rate-limits sends: 3 per phone per 10 min', async () => {
    const phone = testPhone();
    await requestOtp(phone, ip('3'));
    await requestOtp(phone, ip('3'));
    await requestOtp(phone, ip('3'));
    await expect(requestOtp(phone, ip('3'))).rejects.toThrow(RateLimitedError);
  });

  it('rejects invalid phone numbers', async () => {
    await expect(requestOtp('not-a-number', ip('4'))).rejects.toThrow('valid phone');
  });
});

describe('magic link', () => {
  it('sends a sign-in link (no account enumeration)', async () => {
    const address = `seun${Date.now()}@example.com`;
    const result = await sendMagicLink(address, ip('5'));
    expect(result).toEqual({ ok: true });
    const last = email.sent[email.sent.length - 1];
    expect(last?.to).toBe(address);
    expect(last?.html).toContain('/api/auth/magic-link/verify');
  });
});

describe('auth instance', () => {
  it('exposes the better-auth handler', () => {
    expect(typeof auth.handler).toBe('function');
    expect(typeof auth.api.sendPhoneNumberOTP).toBe('function');
  });
});
