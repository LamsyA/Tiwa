import { ACCOUNT_NUMBER_PATTERN, bankName, banksFor, env } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import { loadEventAccess } from '../events/access.js';
import { notify } from '../messaging/notify.js';

// Payout bank account (Backend.md §6 `setupBankAccount`, D-X46, D-X103).
// Org OWNER only. The account name is never typed: it comes from a NUBAN
// name lookup (Monnify, else Paystack, else a clearly-labelled demo name). The full number is stored so payers
// can see where to send money. Every add, change or removal emails the
// business's owners and admins (security alert).

type UserActor = Extract<Actor, { kind: 'user' }>;

export const setupBankAccountSchema = z.object({
  orgId: z.string().uuid(),
  bankCode: z.string().trim().min(2, 'bankRequired').max(12),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, 'accountNumberInvalid'),
  /** Ignored: the name always comes from the bank lookup (D-X103). */
  accountName: z.string().trim().max(120).optional(),
});

export const resolveBankAccountSchema = z.object({
  orgId: z.string().uuid(),
  bankCode: z.string().trim().min(2, 'bankRequired').max(12),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, 'accountNumberInvalid'),
});

export interface ResolvedAccount {
  accountName: string;
  /** True when a real bank lookup confirmed the name. */
  verified: boolean;
}

/** NUBAN name lookup (D-X103, D-X104). Monnify when its keys are set, then
 * Paystack, otherwise a clearly-labelled demo name so local and demo
 * environments still work. Throws `accountNotFound` when the bank says the
 * number doesn't exist, `lookupFailed` when the provider can't be reached. */
export async function lookupAccountName(bankCode: string, accountNumber: string): Promise<ResolvedAccount> {
  if (env.MONNIFY_API_KEY && env.MONNIFY_SECRET_KEY) return monnifyLookup(bankCode, accountNumber);
  if (env.PAYSTACK_SECRET_KEY) return paystackLookup(bankCode, accountNumber);
  return { accountName: `DEMO ACCOUNT ${accountNumber.slice(-4)}`, verified: false };
}

const lookupFailed = () => new ValidationError('Could not reach the bank. Try again.', { key: 'lookupFailed' });
const notFound = () =>
  new ValidationError('No account with that number at this bank', { field: 'accountNumber', key: 'accountNotFound' });

// Monnify access tokens last about an hour; reuse one until shortly before expiry.
let monnifyToken: { value: string; until: number } | null = null;

async function monnifyAuth(base: string): Promise<string> {
  if (monnifyToken && monnifyToken.until > Date.now()) return monnifyToken.value;
  const basic = Buffer.from(`${env.MONNIFY_API_KEY}:${env.MONNIFY_SECRET_KEY}`).toString('base64');
  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as {
    requestSuccessful?: boolean;
    responseBody?: { accessToken?: string; expiresIn?: number };
  } | null;
  const token = body?.responseBody?.accessToken;
  if (!response?.ok || !token) throw lookupFailed();
  const seconds = body?.responseBody?.expiresIn ?? 3000;
  monnifyToken = { value: token, until: Date.now() + Math.max(60, seconds - 60) * 1000 };
  return token;
}

async function monnifyLookup(bankCode: string, accountNumber: string): Promise<ResolvedAccount> {
  const base = (env.MONNIFY_BASE_URL ?? 'https://sandbox.monnify.com').replace(/\/$/, '');
  const token = await monnifyAuth(base);
  const url = `${base}/api/v1/disbursements/account/validate?accountNumber=${encodeURIComponent(accountNumber)}&bankCode=${encodeURIComponent(bankCode)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response) throw lookupFailed();
  if (response.status === 401) monnifyToken = null;
  if (response.status >= 500 || response.status === 401) throw lookupFailed();
  const body = (await response.json().catch(() => null)) as {
    requestSuccessful?: boolean;
    responseBody?: { accountName?: string };
  } | null;
  const name = body?.responseBody?.accountName?.trim();
  if (!body?.requestSuccessful || !name) throw notFound();
  return { accountName: name, verified: true };
}

async function paystackLookup(bankCode: string, accountNumber: string): Promise<ResolvedAccount> {
  const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response) throw lookupFailed();
  if (response.status >= 500) throw lookupFailed();
  const body = (await response.json().catch(() => null)) as {
    status?: boolean;
    data?: { account_name?: string };
  } | null;
  const name = body?.data?.account_name?.trim();
  if (!response.ok || !body?.status || !name) throw notFound();
  return { accountName: name, verified: true };
}

async function checkAccountInput(countryCode: string, bankCode: string, accountNumber: string) {
  const banks = banksFor(countryCode);
  if (banks.length > 0 && !banks.some((bank) => bank.code === bankCode)) {
    throw new ValidationError('Pick a bank from the list', { field: 'bankCode', key: 'bankRequired' });
  }
  const pattern = ACCOUNT_NUMBER_PATTERN[countryCode];
  if (pattern && !pattern.test(accountNumber)) {
    throw new ValidationError('Account number looks wrong', { field: 'accountNumber', key: 'accountNumberInvalid' });
  }
}

/** Live lookup while the owner types (owner-only, so it isn't an open name oracle). */
export async function resolveBankAccount(actor: UserActor, raw: z.input<typeof resolveBankAccountSchema>) {
  const input = resolveBankAccountSchema.parse(raw);
  const org = await requireOwner(actor, input.orgId);
  await checkAccountInput(org.countryCode, input.bankCode, input.accountNumber);
  return lookupAccountName(input.bankCode, input.accountNumber);
}

/** Security alert (D-X103): every owner and admin hears about payout-account changes. */
async function alertBankChange(
  actor: UserActor,
  orgId: string,
  orgName: string,
  what: 'added' | 'changed' | 'removed',
  detail: string,
) {
  const [people, who] = await Promise.all([
    prisma.membership.findMany({ where: { orgId, role: { in: ['OWNER', 'ADMIN'] } }, select: { userId: true } }),
    prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } }),
  ]);
  const title = what === 'removed' ? `Payout account removed on ${orgName}` : `Payout account ${what} on ${orgName}`;
  const body = `${who?.name ?? 'A team owner'} ${what} the bank account payments go to${detail ? `: ${detail}` : ''}. If this wasn't you or your team, contact Tiwa support right away and change your password.`;
  for (const person of people) {
    await notify(
      { kind: 'system' },
      {
        userId: person.userId,
        type: 'security.bankChanged',
        title: title.slice(0, 200),
        body: body.slice(0, 1000),
        url: '/business/profile#payouts',
        data: { orgId, what },
      },
    ).catch(() => undefined);
  }
}

async function requireOwner(actor: UserActor, orgId: string) {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { countryCode: true, deletedAt: true, name: true },
    }),
  ]);
  if (!org || org.deletedAt) throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, 'org.bank.manage', orgId, membership ? { orgId, role: membership.role } : null);
  return org;
}

export async function setupBankAccount(actor: UserActor, raw: z.input<typeof setupBankAccountSchema>) {
  const input = setupBankAccountSchema.parse(raw);
  const org = await requireOwner(actor, input.orgId);
  await checkAccountInput(org.countryCode, input.bankCode, input.accountNumber);
  // The name comes from the bank, never from the form (D-X103).
  const resolved = await lookupAccountName(input.bankCode, input.accountNumber);
  const previous = await prisma.bankAccount.findFirst({
    where: { orgId: input.orgId, isDefault: true },
    select: { id: true },
  });
  const account = await prisma.$transaction(async (tx) => {
    await tx.bankAccount.updateMany({ where: { orgId: input.orgId, isDefault: true }, data: { isDefault: false } });
    const account = await tx.bankAccount.create({
      data: {
        orgId: input.orgId,
        bankCode: input.bankCode,
        accountNumberLast4: input.accountNumber.slice(-4),
        accountNumber: input.accountNumber,
        accountName: resolved.accountName,
        provider: env.PAYMENT_PROVIDER,
        isDefault: true,
        ...(resolved.verified ? { verifiedAt: new Date() } : {}),
      },
    });
    await audit(tx, {
      actor,
      action: 'org.bank.setup',
      targetType: 'Organization',
      targetId: input.orgId,
      data: { bankAccountId: account.id, bankCode: input.bankCode, last4: account.accountNumberLast4 },
    });
    return account;
  });
  await alertBankChange(
    actor,
    input.orgId,
    org.name,
    previous ? 'changed' : 'added',
    `${bankName(org.countryCode, input.bankCode)} ••••${account.accountNumberLast4} (${resolved.accountName})`,
  );
  return account;
}

export const removeBankAccountSchema = z.object({ orgId: z.string().uuid(), bankAccountId: z.string().uuid() });

export async function removeBankAccount(actor: UserActor, raw: z.input<typeof removeBankAccountSchema>) {
  const input = removeBankAccountSchema.parse(raw);
  const org = await requireOwner(actor, input.orgId);
  await prisma.$transaction(async (tx) => {
    const removed = await tx.bankAccount.deleteMany({ where: { id: input.bankAccountId, orgId: input.orgId } });
    if (removed.count === 0) throw new NotFoundError('Bank account not found');
    await audit(tx, {
      actor,
      action: 'org.bank.remove',
      targetType: 'Organization',
      targetId: input.orgId,
      data: { bankAccountId: input.bankAccountId },
    });
  });
  await alertBankChange(actor, input.orgId, org.name, 'removed', '');
}

/** The default payout account, for any member (shows masked details only). */
export async function payoutAccount(actor: UserActor, orgId: string) {
  const membership = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } });
  authorizeOrg(actor, 'org.view', orgId, membership ? { orgId, role: membership.role } : null);
  return prisma.bankAccount.findFirst({
    where: { orgId, isDefault: true },
    select: {
      id: true,
      bankCode: true,
      accountNumberLast4: true,
      accountName: true,
      verifiedAt: true,
      createdAt: true,
    },
  });
}

export const payeeBankAccountSchema = z.object({ bookingId: z.string().uuid() });

/**
 * Where to send money for a booking (D-X103): the payee business's default
 * account, in full, for people paying on the event side (host, co-host,
 * planner). Vendors and photographers on the event never see another
 * business's account. Null when the payee hasn't added one, or saved it
 * before full numbers were kept.
 */
export async function payeeBankAccount(actor: UserActor, raw: z.input<typeof payeeBankAccountSchema>) {
  const { bookingId } = payeeBankAccountSchema.parse(raw);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { eventId: true, vendorOrgId: true },
  });
  if (!booking) throw new NotFoundError('Booking not found');
  const access = await loadEventAccess(actor.userId, booking.eventId);
  if (!access || access.role === 'VENDOR' || access.role === 'PHOTOGRAPHER') {
    throw new NotFoundError('Booking not found');
  }
  const account = await prisma.bankAccount.findFirst({
    where: { orgId: booking.vendorOrgId, isDefault: true },
    select: { bankCode: true, accountNumber: true, accountName: true, verifiedAt: true },
  });
  if (!account?.accountNumber) return null;
  const org = await prisma.organization.findUnique({
    where: { id: booking.vendorOrgId },
    select: { name: true, countryCode: true },
  });
  return {
    payeeName: org?.name ?? '',
    bankName: bankName(org?.countryCode ?? 'NG', account.bankCode),
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    verified: account.verifiedAt !== null,
  };
}
