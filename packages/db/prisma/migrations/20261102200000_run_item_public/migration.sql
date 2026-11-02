-- Run-of-show items guests can follow on the live agenda page.
ALTER TABLE "RunItem" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
