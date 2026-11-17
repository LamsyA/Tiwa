-- D-X67: permanent history of every sent quote/proposal version.
CREATE TABLE "QuoteRevision" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "taxBps" INTEGER NOT NULL,
    "serviceBps" INTEGER NOT NULL,
    "travelFeeMinor" BIGINT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "notes" TEXT,
    "cancellationTerms" TEXT NOT NULL,
    "proposedSchedule" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "sentById" TEXT,
    "changeRequest" TEXT,
    "changeRequestedAt" TIMESTAMP(3),
    "changeRequestedById" TEXT,
    CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuoteRevision_quoteId_revision_key" ON "QuoteRevision"("quoteId", "revision");
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every quote that was ever sent gets its current version as history.
INSERT INTO "QuoteRevision" ("id", "quoteId", "revision", "items", "taxBps", "serviceBps", "travelFeeMinor",
  "subtotalMinor", "totalMinor", "currency", "notes", "cancellationTerms", "proposedSchedule", "expiresAt",
  "sentAt", "changeRequest", "changeRequestedAt")
SELECT gen_random_uuid()::text, q."id", q."revision", q."items", q."taxBps", q."serviceBps", q."travelFeeMinor",
  q."subtotalMinor", q."totalMinor", q."currency", q."notes", q."cancellationTerms", q."proposedSchedule", q."expiresAt",
  q."sentAt", CASE WHEN q."status" = 'CHANGES_REQUESTED' THEN q."changeRequest" END,
  CASE WHEN q."status" = 'CHANGES_REQUESTED' THEN q."changeRequestedAt" END
FROM "Quote" q
WHERE q."sentAt" IS NOT NULL;
