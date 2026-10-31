-- CreateEnum
CREATE TYPE "MediaZipStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "MediaZip" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "status" "MediaZipStatus" NOT NULL DEFAULT 'PENDING',
    "key" TEXT,
    "sizeBytes" INTEGER,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "MediaZip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaZip_galleryId_createdAt_idx" ON "MediaZip"("galleryId", "createdAt");
