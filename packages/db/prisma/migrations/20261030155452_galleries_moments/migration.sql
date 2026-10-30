-- CreateEnum
CREATE TYPE "GalleryPrivacy" AS ENUM ('GUESTS_ONLY', 'LINK', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ModerationMode" AS ENUM ('INSTANT', 'APPROVE_FIRST');

-- CreateEnum
CREATE TYPE "GalleryPlan" AS ENUM ('FREE', 'PLUS');

-- CreateEnum
CREATE TYPE "Album" AS ENUM ('OFFICIAL', 'GUEST');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaState" AS ENUM ('UPLOADING', 'PROCESSING', 'PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'BLOCKED', 'FAILED');

-- CreateTable
CREATE TABLE "Gallery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "accessCode" TEXT,
    "privacy" "GalleryPrivacy" NOT NULL DEFAULT 'LINK',
    "moderation" "ModerationMode" NOT NULL DEFAULT 'INSTANT',
    "slideshowDelaySec" INTEGER NOT NULL DEFAULT 30,
    "guestDownloads" BOOLEAN NOT NULL DEFAULT true,
    "showFooter" BOOLEAN NOT NULL DEFAULT true,
    "plan" "GalleryPlan" NOT NULL DEFAULT 'FREE',
    "itemLimit" INTEGER NOT NULL DEFAULT 500,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Gallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "name" TEXT,
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaItem" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "album" "Album" NOT NULL,
    "uploaderUserId" TEXT,
    "uploaderSessionId" TEXT,
    "kind" "MediaKind" NOT NULL,
    "state" "MediaState" NOT NULL DEFAULT 'UPLOADING',
    "originalKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "largeKey" TEXT,
    "posterKey" TEXT,
    "blurDataUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "takenAt" TIMESTAMP(3),
    "caption" TEXT,
    "altText" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "watermarked" BOOLEAN NOT NULL DEFAULT false,
    "moderationLabels" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestbookMessage" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "name" TEXT,
    "body" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestbookMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reporterSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gallery_eventId_key" ON "Gallery"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Gallery_code_key" ON "Gallery"("code");

-- CreateIndex
CREATE INDEX "GuestSession_galleryId_idx" ON "GuestSession"("galleryId");

-- CreateIndex
CREATE INDEX "MediaItem_galleryId_state_album_createdAt_idx" ON "MediaItem"("galleryId", "state", "album", "createdAt");

-- CreateIndex
CREATE INDEX "MediaItem_galleryId_sha256_idx" ON "MediaItem"("galleryId", "sha256");

-- CreateIndex
CREATE INDEX "GuestbookMessage_galleryId_createdAt_idx" ON "GuestbookMessage"("galleryId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- AddForeignKey
ALTER TABLE "Gallery" ADD CONSTRAINT "Gallery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
