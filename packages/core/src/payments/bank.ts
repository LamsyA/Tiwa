import { ACCOUNT_NUMBER_PATTERN, banksFor, env } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Payout bank account (Backend.md §6 `setupBankAccount`, D-X46). Org OWNER
// only. The full account number is never stored: only its last 4 digits.
// With a real provider the number goes to it for a name lookup and a
// recipient code; with the fake provider the typed name is kept unverified.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const setupBankAccountSchema = z.object({
  orgId: z.string().uuid(),
  bankCode: z.string().trim().min(2, 'bankRequired').max(12),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, 'accountNumberInvalid'),
  accountName: z.string().trim().min(2, 'accountNameRequired').max(120),
});

async function requireOwner(actor: UserActor, orgId: string) {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { countryCode: true, deletedAt: true } }),
  ]);
  if (!org || org.deletedAt) throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, 'org.bank.manage', orgId, membership ? { orgId, role: membership.role } : null);
  return org;
}

export async function setupBankAccount(actor: UserActor, raw: z.input<typeof setupBankAccountSchema>) {
  const input = setupBankAccountSchema.parse(raw);
  const org = await requireOwner(actor, input.orgId);
  const banks = banksFor(org.countryCode);
  if (banks.length > 0 && !banks.some((bank) => bank.code === input.bankCode)) {
    throw new ValidationError('Pick a bank from the list', { field: 'bankCode', key: 'bankRequired' });
  }
  const pattern = ACCOUNT_NUMBER_PATTERN[org.countryCode];
  if (pattern && !pattern.test(input.accountNumber)) {
    throw new ValidationError('Account number looks wrong', { field: 'accountNumber', key: 'accountNumberInvalid' });
  }
  return prisma.$transaction(async (tx) => {
    await tx.bankAccount.updateMany({ where: { orgId: input.orgId, isDefault: true }, data: { isDefault: false } });
    const account = await tx.bankAccount.create({
      data: {
        orgId: input.orgId,
        bankCode: input.bankCode,
        accountNumberLast4: input.accountNumber.slice(-4),
        accountName: input.accountName,
        provider: env.PAYMENT_PROVIDER,
        isDefault: true,
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
}

export const removeBankAccountSchema = z.object({ orgId: z.string().uuid(), bankAccountId: z.string().uuid() });

export async function removeBankAccount(actor: UserActor, raw: z.input<typeof removeBankAccountSchema>) {
  const input = removeBankAccountSchema.parse(raw);
  await requireOwner(actor, input.orgId);
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
