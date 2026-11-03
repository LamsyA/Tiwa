// D-X46: payout bank account — owner only, last 4 digits stored, one default.
import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { payoutAccount, removeBankAccount, setupBankAccount } from './bank.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
let orgId = '';
let owner: UserActor;
let admin: UserActor;
let outsider: UserActor;
const RUN = String(Date.now()).slice(-6);

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'Bank Org', slug: `bank-org-${RUN}`, countryCode: 'NG' },
  });
  orgId = org.id;
  owner = await makeUser('BankOwner');
  admin = await makeUser('BankAdmin');
  outsider = await makeUser('BankOut');
  await prisma.membership.create({ data: { orgId, userId: owner.userId, role: 'OWNER' } });
  await prisma.membership.create({ data: { orgId, userId: admin.userId, role: 'ADMIN' } });
});

afterAll(async () => {
  await prisma.bankAccount.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { targetId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe('setupBankAccount (D-X46)', () => {
  it('keeps only the last 4 digits and replaces the default', async () => {
    const first = await setupBankAccount(owner, {
      orgId,
      bankCode: '058',
      accountNumber: '0123456789',
      accountName: 'Bank Org Ltd',
    });
    expect(first.accountNumberLast4).toBe('6789');
    expect(JSON.stringify(first)).not.toContain('0123456789');
    await setupBankAccount(owner, { orgId, bankCode: '057', accountNumber: '9876543210', accountName: 'Bank Org Ltd' });
    const current = await payoutAccount(admin, orgId);
    expect(current?.bankCode).toBe('057');
    expect(await prisma.bankAccount.count({ where: { orgId, isDefault: true } })).toBe(1);
    await removeBankAccount(owner, { orgId, bankAccountId: current!.id });
    expect(await payoutAccount(owner, orgId)).toBeNull();
  });

  it('rejects admins, outsiders, unknown banks and bad numbers', async () => {
    const good = { orgId, bankCode: '058', accountNumber: '0123456789', accountName: 'Bank Org Ltd' };
    await expect(setupBankAccount(admin, good)).rejects.toThrow();
    await expect(setupBankAccount(outsider, good)).rejects.toThrow();
    await expect(setupBankAccount(owner, { ...good, bankCode: '999' })).rejects.toThrow('Pick a bank');
    await expect(setupBankAccount(owner, { ...good, accountNumber: '12345678' })).rejects.toThrow(
      'Account number looks wrong',
    );
  });
});
