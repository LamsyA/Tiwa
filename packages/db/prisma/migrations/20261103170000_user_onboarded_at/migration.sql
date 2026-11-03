-- D-X51: explicit "finished onboarding" marker.
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- Existing users who clearly finished (own a business, joined one, or are on
-- an event) keep going straight to /home. Everyone else picks a role next time.
UPDATE "User" u SET "onboardedAt" = u."createdAt"
WHERE EXISTS (SELECT 1 FROM "Membership" m WHERE m."userId" = u."id")
   OR EXISTS (SELECT 1 FROM "EventParticipant" p WHERE p."userId" = u."id")
   OR EXISTS (SELECT 1 FROM "Event" e WHERE e."createdById" = u."id");
