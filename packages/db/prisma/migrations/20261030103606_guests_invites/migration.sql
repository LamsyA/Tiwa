-- CreateEnum
CREATE TYPE "GuestSource" AS ENUM ('MANUAL', 'PASTE', 'CSV', 'CONTACTS', 'SHARED_LINK', 'TICKET');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('NONE', 'YES', 'NO', 'MAYBE');

-- CreateEnum
CREATE TYPE "BatchKind" AS ENUM ('INVITE', 'UPDATE', 'REMINDER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InviteChannel" AS ENUM ('LINK', 'QR', 'WHATSAPP_FREE', 'WHATSAPP_API', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'SENT_MANUALLY');

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" CITEXT,
    "groupIds" TEXT[],
    "plusOnesAllowed" INTEGER NOT NULL DEFAULT 0,
    "plusOnes" INTEGER NOT NULL DEFAULT 0,
    "meal" TEXT,
    "dietary" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "tableId" TEXT,
    "source" "GuestSource" NOT NULL DEFAULT 'MANUAL',
    "rsvp" "RsvpStatus" NOT NULL DEFAULT 'NONE',
    "respondedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "inviteToken" TEXT,
    "inviteRevokedAt" TIMESTAMP(3),
    "inviteOpenedAt" TIMESTAMP(3),
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestGroup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "GuestGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatingTable" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "SeatingTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteBatch" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "channels" "InviteChannel"[],
    "smart" BOOLEAN NOT NULL DEFAULT true,
    "message" TEXT NOT NULL,
    "kind" "BatchKind" NOT NULL DEFAULT 'INVITE',
    "audience" JSONB NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "InviteBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteDelivery" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "channel" "InviteChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "providerRef" TEXT,
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InviteDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guest_inviteToken_key" ON "Guest"("inviteToken");

-- CreateIndex
CREATE INDEX "Guest_eventId_rsvp_idx" ON "Guest"("eventId", "rsvp");

-- CreateIndex
CREATE INDEX "Guest_eventId_phone_idx" ON "Guest"("eventId", "phone");

-- CreateIndex
CREATE INDEX "GuestGroup_eventId_idx" ON "GuestGroup"("eventId");

-- CreateIndex
CREATE INDEX "SeatingTable_eventId_idx" ON "SeatingTable"("eventId");

-- CreateIndex
CREATE INDEX "InviteBatch_eventId_status_idx" ON "InviteBatch"("eventId", "status");

-- CreateIndex
CREATE INDEX "InviteDelivery_batchId_status_idx" ON "InviteDelivery"("batchId", "status");

-- CreateIndex
CREATE INDEX "InviteDelivery_guestId_idx" ON "InviteDelivery"("guestId");

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteDelivery" ADD CONSTRAINT "InviteDelivery_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
