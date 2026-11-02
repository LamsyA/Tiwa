-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PLANNED', 'STARTED', 'DONE', 'LATE', 'SKIPPED');

-- NOTE (P6-T01, P12-T01): BusinessProfile.business_search_trgm and
-- AvailabilityBlock.availability_unique live in raw SQL
-- (20261031134131_marketplace_indexes) and are intentionally absent from
-- schema.prisma. The DropIndex drift `migrate dev` proposed for them was
-- deleted here; the SQL was re-applied to this database instead.

-- CreateTable
CREATE TABLE "RunItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dayId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 15,
    "ownerUserId" TEXT,
    "ownerOrgId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'PLANNED',
    "lateByMin" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunDependency" (
    "itemId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,

    CONSTRAINT "RunDependency_pkey" PRIMARY KEY ("itemId","dependsOnId")
);

-- CreateTable
CREATE TABLE "VendorCheckIn" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "VendorCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'normal',
    "ownerUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isBackupVendor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunItem_eventId_startsAt_idx" ON "RunItem"("eventId", "startsAt");

-- CreateIndex
CREATE INDEX "RunDependency_dependsOnId_idx" ON "RunDependency"("dependsOnId");

-- CreateIndex
CREATE INDEX "VendorCheckIn_eventId_at_idx" ON "VendorCheckIn"("eventId", "at");

-- CreateIndex
CREATE INDEX "Incident_eventId_createdAt_idx" ON "Incident"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyContact_eventId_idx" ON "EmergencyContact"("eventId");

-- AddForeignKey
ALTER TABLE "RunItem" ADD CONSTRAINT "RunItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunDependency" ADD CONSTRAINT "RunDependency_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RunItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunDependency" ADD CONSTRAINT "RunDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "RunItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCheckIn" ADD CONSTRAINT "VendorCheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
