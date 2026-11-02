-- AlterTable (eventId landed earlier via a parallel migration)
ALTER TABLE "PortfolioItem" ADD COLUMN "mediaItemId" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioItem_mediaItemId_key" ON "PortfolioItem"("mediaItemId");

-- CreateIndex
CREATE INDEX "PortfolioItem_eventId_idx" ON "PortfolioItem"("eventId");
