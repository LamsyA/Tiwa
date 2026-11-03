-- D-X47: planner engagement on events (CRM client + fee agreement).
ALTER TABLE "Event" ADD COLUMN "clientId" TEXT,
ADD COLUMN "plannerFeeBps" INTEGER,
ADD COLUMN "plannerFeeMinor" BIGINT,
ADD COLUMN "plannerFeeNote" TEXT;

CREATE INDEX "Event_clientId_idx" ON "Event"("clientId");

-- Events a planner created themselves were never tied to their planner
-- org, so the planner dashboard missed them: link the creator's HOST row.
UPDATE "EventParticipant" ep
SET "orgId" = m."orgId"
FROM "Event" e, "Membership" m, "Organization" o
WHERE ep."eventId" = e."id"
  AND ep."role" = 'HOST'
  AND ep."orgId" IS NULL
  AND ep."userId" = e."createdById"
  AND m."userId" = ep."userId"
  AND o."id" = m."orgId"
  AND o."kind" = 'PLANNER';
