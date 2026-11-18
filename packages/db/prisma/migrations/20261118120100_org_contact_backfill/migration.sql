-- D-X90: start each planner/vendor business with its owner's own phone and email, where known.
UPDATE "Organization" o
SET "contactPhone" = u."phone"
FROM "Membership" m JOIN "User" u ON u."id" = m."userId"
WHERE m."orgId" = o."id" AND m."role" = 'OWNER' AND o."contactPhone" IS NULL AND u."phone" IS NOT NULL;

UPDATE "Organization" o
SET "contactEmail" = u."email"
FROM "Membership" m JOIN "User" u ON u."id" = m."userId"
WHERE m."orgId" = o."id" AND m."role" = 'OWNER' AND o."contactEmail" IS NULL
  AND u."email" IS NOT NULL AND u."email" NOT LIKE '%@phone.tiwa.local' AND u."email" NOT LIKE '%@user.tiwa.local';
