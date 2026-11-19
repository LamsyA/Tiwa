// D-X46/D-X103: payout bank account — owner only, name from the bank lookup, one default, owners alerted.
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
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe('setupBankAccount (D-X46)', () => {
  it('takes the name from the lookup, replaces the default and alerts owners and admins', async () => {
    const first = await setupBankAccount(owner, {
      orgId,
      bankCode: '058',
      accountNumber: '0123456789',
      accountName: 'Typed Name Is Ignored',
    });
    expect(first.accountNumberLast4).toBe('6789');
    expect(first.accountNumber).toBe('0123456789');
    expect(first.accountName).not.toBe('Typed Name Is Ignored'); // demo lookup without a Paystack key
    await setupBankAccount(owner, { orgId, bankCode: '057', accountNumber: '9876543210', accountName: 'Bank Org Ltd' });
    const current = await payoutAccount(admin, orgId);
    expect(current?.bankCode).toBe('057');
    expect(await prisma.bankAccount.count({ where: { orgId, isDefault: true } })).toBe(1);
    const alerts = await prisma.notification.findMany({
      where: { userId: { in: [owner.userId, admin.userId] }, type: 'security.bankChanged' },
    });
    expect(alerts).toHaveLength(4); // added + changed, to both owner and admin
    await removeBankAccount(owner, { orgId, bankAccountId: current!.id });
    expect(await payoutAccount(owner, orgId)).toBeNull();
    expect(await prisma.notification.count({ where: { userId: admin.userId, type: 'security.bankChanged' } })).toBe(3);
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
