/*
  Warnings:

  - The primary key for the `FeatureFlagOverride` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Made the column `countryCode` on table `FeatureFlagOverride` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "FeatureFlagOverride" DROP CONSTRAINT "FeatureFlagOverride_pkey",
ALTER COLUMN "countryCode" SET NOT NULL,
ADD CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("key", "countryCode");
