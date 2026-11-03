-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "bankCode" TEXT NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subaccountCode" TEXT,
    "recipientCode" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "payoutsPausedUntil" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankAccount_orgId_idx" ON "BankAccount"("orgId");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

