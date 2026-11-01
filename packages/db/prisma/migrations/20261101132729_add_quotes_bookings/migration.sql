-- CreateEnum
CREATE TYPE "QuoteRequestStatus" AS ENUM ('OPEN', 'QUOTED', 'DECLINED_BY_VENDOR', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'CHANGES_REQUESTED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('ACCEPTED', 'DEPOSIT_DUE', 'CONFIRMED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('DIRECT', 'HELD', 'OFFLINE');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "MilestoneKind" AS ENUM ('PAYMENT', 'SECURITY_DEPOSIT');

-- CreateEnum
CREATE TYPE "ReleaseRule" AS ENUM ('ON_PAYMENT', 'ON_DATE', 'ON_VENDOR_CHECK_IN', 'ON_HOST_SIGNOFF');

-- CreateEnum
CREATE TYPE "MilestoneState" AS ENUM ('SCHEDULED', 'PENDING_PAYMENT', 'PAID_DIRECT', 'HELD', 'RELEASED', 'REFUNDED', 'PARTLY_REFUNDED', 'DISPUTED', 'RECORDED_OFFLINE', 'CONFIRMED_OFFLINE');

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "vendorOrgId" TEXT NOT NULL,
    "brief" JSONB NOT NULL,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "eventId" TEXT NOT NULL,
    "vendorOrgId" TEXT NOT NULL,
    "spaceId" TEXT,
    "serviceDate" DATE,
    "slot" "DaySlot",
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "items" JSONB NOT NULL,
    "taxBps" INTEGER NOT NULL DEFAULT 0,
    "serviceBps" INTEGER NOT NULL DEFAULT 0,
    "travelFeeMinor" BIGINT NOT NULL DEFAULT 0,
    "subtotalMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "notes" TEXT,
    "cancellationTerms" TEXT NOT NULL,
    "proposedSchedule" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "vendorOrgId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "spaceId" TEXT,
    "serviceDate" DATE,
    "slot" "DaySlot",
    "status" "BookingStatus" NOT NULL DEFAULT 'ACCEPTED',
    "paymentMode" "PaymentMode" NOT NULL,
    "holdExpiresAt" TIMESTAMP(3),
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "totalMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "signedOffAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingVersion" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'PROPOSED',
    "scope" JSONB NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "terms" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "reason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "acceptedByHostId" TEXT,
    "acceptedByHostAt" TIMESTAMP(3),
    "acceptedByHostIp" TEXT,
    "acceptedByVendorId" TEXT,
    "acceptedByVendorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "vendorOrgId" TEXT NOT NULL,
    "spaceId" TEXT,
    "requestedById" TEXT NOT NULL,
    "proposedTimes" TIMESTAMP(3)[],
    "confirmedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMilestone" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "MilestoneKind" NOT NULL DEFAULT 'PAYMENT',
    "label" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "releaseRule" "ReleaseRule" NOT NULL DEFAULT 'ON_PAYMENT',
    "releaseAt" TIMESTAMP(3),
    "autoReleaseAfterHours" INTEGER,
    "state" "MilestoneState" NOT NULL DEFAULT 'SCHEDULED',
    "paidAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteRequest_vendorOrgId_status_idx" ON "QuoteRequest"("vendorOrgId", "status");

-- CreateIndex
CREATE INDEX "QuoteRequest_eventId_status_idx" ON "QuoteRequest"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_eventId_category_vendorOrgId_key" ON "QuoteRequest"("eventId", "category", "vendorOrgId");

-- CreateIndex
CREATE INDEX "Quote_eventId_status_idx" ON "Quote"("eventId", "status");

-- CreateIndex
CREATE INDEX "Quote_vendorOrgId_status_idx" ON "Quote"("vendorOrgId", "status");

-- CreateIndex
CREATE INDEX "Quote_requestId_idx" ON "Quote"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_quoteId_key" ON "Booking"("quoteId");

-- CreateIndex
CREATE INDEX "Booking_vendorOrgId_status_idx" ON "Booking"("vendorOrgId", "status");

-- CreateIndex
CREATE INDEX "Booking_eventId_status_idx" ON "Booking"("eventId", "status");

-- CreateIndex
CREATE INDEX "BookingVersion_bookingId_status_idx" ON "BookingVersion"("bookingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BookingVersion_bookingId_version_key" ON "BookingVersion"("bookingId", "version");

-- CreateIndex
CREATE INDEX "SiteVisit_vendorOrgId_status_idx" ON "SiteVisit"("vendorOrgId", "status");

-- CreateIndex
CREATE INDEX "SiteVisit_eventId_idx" ON "SiteVisit"("eventId");

-- CreateIndex
CREATE INDEX "PaymentMilestone_state_releaseAt_idx" ON "PaymentMilestone"("state", "releaseAt");

-- CreateIndex
CREATE INDEX "PaymentMilestone_bookingId_idx" ON "PaymentMilestone"("bookingId");

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingVersion" ADD CONSTRAINT "BookingVersion_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMilestone" ADD CONSTRAINT "PaymentMilestone_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
