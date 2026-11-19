-- D-X103: keep the full payout account number so payers can see it.
ALTER TABLE "BankAccount" ADD COLUMN "accountNumber" TEXT;
