-- CreateEnum
CREATE TYPE "DaySlot" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY');

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "categories" TEXT[],
    "bio" TEXT,
    "city" TEXT NOT NULL,
    "serviceAreaKm" INTEGER NOT NULL DEFAULT 50,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "startingPriceMinor" BIGINT,
    "currency" TEXT NOT NULL,
    "travelFeeNote" TEXT,
    "instantBook" BOOLEAN NOT NULL DEFAULT false,
    "holdHours" INTEGER NOT NULL DEFAULT 72,
    "allowGuestEnquiries" BOOLEAN NOT NULL DEFAULT true,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "availabilityConfirmedAt" TIMESTAMP(3),
    "ratingAvg" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "completedBookings" INTEGER NOT NULL DEFAULT 0,
    "searchText" TEXT,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueSpace" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "indoor" BOOLEAN NOT NULL DEFAULT true,
    "capacitySeated" INTEGER,
    "capacityTheatre" INTEGER,
    "capacityStanding" INTEGER,
    "sizeSqm" INTEGER,
    "amenities" TEXT[],
    "rules" TEXT,
    "slotPrices" JSONB NOT NULL,
    "setupMinutes" INTEGER NOT NULL DEFAULT 120,
    "teardownMinutes" INTEGER NOT NULL DEFAULT 60,
    "securityDepositMinor" BIGINT,
    "photoKeys" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VenueSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "key" TEXT NOT NULL,
    "thumbKey" TEXT,
    "caption" TEXT,
    "eventId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMinor" BIGINT,
    "currency" TEXT NOT NULL,
    "includes" TEXT[],
    "addOns" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityBlock" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "spaceId" TEXT,
    "date" DATE NOT NULL,
    "slot" "DaySlot" NOT NULL DEFAULT 'FULL_DAY',
    "bookingId" TEXT,
    "reason" TEXT,

    CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessVerification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "documents" JSONB NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shortlist" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,

    CONSTRAINT "Shortlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_orgId_key" ON "BusinessProfile"("orgId");

-- CreateIndex
CREATE INDEX "BusinessProfile_city_idx" ON "BusinessProfile"("city");

-- CreateIndex
CREATE INDEX "VenueSpace_profileId_idx" ON "VenueSpace"("profileId");

-- CreateIndex
CREATE INDEX "PortfolioItem_orgId_idx" ON "PortfolioItem"("orgId");

-- CreateIndex
CREATE INDEX "ServicePackage_orgId_idx" ON "ServicePackage"("orgId");

-- CreateIndex
CREATE INDEX "AvailabilityBlock_orgId_date_idx" ON "AvailabilityBlock"("orgId", "date");

-- CreateIndex
CREATE INDEX "BusinessVerification_orgId_status_idx" ON "BusinessVerification"("orgId", "status");

-- CreateIndex
CREATE INDEX "Shortlist_eventId_idx" ON "Shortlist"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Shortlist_eventId_orgId_key" ON "Shortlist"("eventId", "orgId");

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueSpace" ADD CONSTRAINT "VenueSpace_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BusinessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
