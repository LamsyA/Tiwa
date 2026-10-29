-- CreateTable
CREATE TABLE "FeatureFlagOverride" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "countryCode" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("key")
);
