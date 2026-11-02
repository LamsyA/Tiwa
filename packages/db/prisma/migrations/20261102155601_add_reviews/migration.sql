-- NOTE (P6-T01): BusinessProfile.business_search_trgm and
-- AvailabilityBlock.availability_unique live in raw SQL
-- (20261031134131_marketplace_indexes). Drift stripped; SQL re-applied.

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "vendorOrgId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "punctuality" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "scope" INTEGER NOT NULL,
    "overall" DOUBLE PRECISION NOT NULL,
    "body" TEXT,
    "photoIds" TEXT[],
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE INDEX "Review_vendorOrgId_createdAt_idx" ON "Review"("vendorOrgId", "createdAt");
