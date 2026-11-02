-- CreateEnum
CREATE TYPE "TicketOrderStatus" AS ENUM ('RESERVED', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CheckInResult" AS ENUM ('OK', 'DUPLICATE', 'INVALID');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "registrationQuestions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "ticketsPublished" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TicketType" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "maxPerOrder" INTEGER NOT NULL DEFAULT 10,
    "salesStart" TIMESTAMP(3),
    "salesEnd" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER,
    "amountOffMinor" BIGINT,
    "maxUses" INTEGER,
    "used" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketOrder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" CITEXT NOT NULL,
    "buyerPhone" TEXT,
    "items" JSONB NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "TicketOrderStatus" NOT NULL DEFAULT 'RESERVED',
    "reservedUntil" TIMESTAMP(3) NOT NULL,
    "promoCodeId" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderEmail" CITEXT,
    "qrToken" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT,
    "guestId" TEXT,
    "deviceId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "byUserId" TEXT NOT NULL,
    "result" "CheckInResult" NOT NULL,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "name" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketType_eventId_sortOrder_idx" ON "TicketType"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "PromoCode_eventId_idx" ON "PromoCode"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_eventId_code_key" ON "PromoCode"("eventId", "code");

-- CreateIndex
CREATE INDEX "TicketOrder_eventId_status_idx" ON "TicketOrder"("eventId", "status");

-- CreateIndex
CREATE INDEX "TicketOrder_status_reservedUntil_idx" ON "TicketOrder"("status", "reservedUntil");

-- CreateIndex
CREATE INDEX "TicketOrder_eventId_createdAt_idx" ON "TicketOrder"("eventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_qrToken_key" ON "Ticket"("qrToken");

-- CreateIndex
CREATE INDEX "Ticket_orderId_idx" ON "Ticket"("orderId");

-- CreateIndex
CREATE INDEX "Ticket_ticketTypeId_idx" ON "Ticket"("ticketTypeId");

-- CreateIndex
CREATE INDEX "Ticket_eventId_checkedInAt_idx" ON "Ticket"("eventId", "checkedInAt");

-- CreateIndex
CREATE INDEX "CheckIn_eventId_scannedAt_idx" ON "CheckIn"("eventId", "scannedAt");

-- CreateIndex
CREATE INDEX "CheckIn_ticketId_idx" ON "CheckIn"("ticketId");

-- CreateIndex
CREATE INDEX "CheckIn_guestId_idx" ON "CheckIn"("guestId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_eventId_createdAt_idx" ON "WaitlistEntry"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TicketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
