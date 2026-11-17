-- D-X66: keep the host's change-request message on the quote.
ALTER TABLE "Quote" ADD COLUMN "changeRequest" TEXT;
ALTER TABLE "Quote" ADD COLUMN "changeRequestedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
