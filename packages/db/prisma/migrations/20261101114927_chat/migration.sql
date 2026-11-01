-- CreateEnum
CREATE TYPE "ThreadKind" AS ENUM ('EVENT', 'BOOKING', 'DIRECT');

-- CreateEnum
CREATE TYPE "ChatContext" AS ENUM ('EVENT_TEAM', 'BOOKING', 'PROFILE', 'QUOTE_REQUEST', 'QUOTE', 'SITE_VISIT', 'PLANNER_CLIENT', 'PLANNER_VENDOR', 'GUEST_ENQUIRY');

-- CreateEnum
CREATE TYPE "ChatSide" AS ENUM ('CLIENT', 'PLANNER', 'VENDOR', 'GUEST', 'TEAM');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'VOICE', 'CARD', 'SYSTEM');

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "kind" "ThreadKind" NOT NULL,
    "context" "ChatContext" NOT NULL,
    "contextId" TEXT,
    "eventId" TEXT,
    "bookingId" TEXT,
    "createdById" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT,
    "orgId" TEXT,
    "side" "ChatSide" NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "lastDeliveredAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ThreadParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorOrgId" TEXT,
    "clientMessageId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "maskedBody" TEXT,
    "hasContactInfo" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "card" JSONB,
    "replyToId" TEXT,
    "mentions" TEXT[],
    "isDecision" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerUserId" TEXT,
    "blockerOrgId" TEXT,
    "blockedUserId" TEXT,
    "blockedOrgId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Thread_eventId_idx" ON "Thread"("eventId");

-- CreateIndex
CREATE INDEX "Thread_bookingId_idx" ON "Thread"("bookingId");

-- CreateIndex
CREATE INDEX "Thread_lastMessageAt_idx" ON "Thread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "Thread_kind_context_contextId_idx" ON "Thread"("kind", "context", "contextId");

-- CreateIndex
CREATE INDEX "ThreadParticipant_userId_idx" ON "ThreadParticipant"("userId");

-- CreateIndex
CREATE INDEX "ThreadParticipant_orgId_idx" ON "ThreadParticipant"("orgId");

-- CreateIndex
CREATE INDEX "ThreadParticipant_threadId_idx" ON "ThreadParticipant"("threadId");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_threadId_clientMessageId_key" ON "Message"("threadId", "clientMessageId");

-- CreateIndex
CREATE INDEX "UserBlock_blockerUserId_idx" ON "UserBlock"("blockerUserId");

-- CreateIndex
CREATE INDEX "UserBlock_blockerOrgId_idx" ON "UserBlock"("blockerOrgId");

-- CreateIndex
CREATE INDEX "UserBlock_blockedUserId_idx" ON "UserBlock"("blockedUserId");

-- CreateIndex
CREATE INDEX "UserBlock_blockedOrgId_idx" ON "UserBlock"("blockedOrgId");

-- AddForeignKey
ALTER TABLE "ThreadParticipant" ADD CONSTRAINT "ThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
