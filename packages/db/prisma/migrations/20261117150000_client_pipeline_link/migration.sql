-- D-X69: link planner CRM clients to Tiwa hosts and planning requests.
ALTER TABLE "Client" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Client_orgId_userId_key" ON "Client"("orgId", "userId");
ALTER TABLE "QuoteRequest" ADD COLUMN "clientId" TEXT;

-- Backfill: one client per (planner org, host) that asked for a proposal.
INSERT INTO "Client" ("id", "orgId", "name", "phone", "email", "stage", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r."vendorOrgId", COALESCE(NULLIF(u."name", ''), 'Client'), u."phone",
  CASE WHEN u."email" LIKE '%.tiwa.local' THEN NULL ELSE u."email" END, 'ENQUIRY', u."id", MIN(r."createdAt"), NOW()
FROM "QuoteRequest" r JOIN "User" u ON u."id" = r."createdById"
WHERE r."category" = 'planning'
GROUP BY r."vendorOrgId", u."id", u."name", u."phone", u."email"
ON CONFLICT ("orgId", "userId") DO NOTHING;

UPDATE "QuoteRequest" r SET "clientId" = c."id"
FROM "Client" c
WHERE r."category" = 'planning' AND c."orgId" = r."vendorOrgId" AND c."userId" = r."createdById";

-- Stage from how their proposals stand: any accepted → WON; any open → PROPOSAL_SENT; all declined → LOST.
UPDATE "Client" c SET "stage" = s.stage::"LeadStage"
FROM (
  SELECT r."clientId",
    CASE
      WHEN bool_or(q."status" = 'ACCEPTED') THEN 'WON'
      WHEN bool_or(q."status" IN ('SENT', 'CHANGES_REQUESTED')) THEN 'PROPOSAL_SENT'
      WHEN bool_or(q."status" = 'DECLINED') AND NOT bool_or(r."status" = 'OPEN') THEN 'LOST'
      ELSE 'ENQUIRY'
    END AS stage
  FROM "QuoteRequest" r LEFT JOIN "Quote" q ON q."requestId" = r."id"
  WHERE r."clientId" IS NOT NULL
  GROUP BY r."clientId"
) s
WHERE c."id" = s."clientId";
