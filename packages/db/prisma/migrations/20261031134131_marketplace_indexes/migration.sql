-- Marketplace indexes that Prisma can't express (Backend.md "Migrations", P6-T01).

-- Trigram index for vendor/planner text search.
CREATE INDEX IF NOT EXISTS business_search_trgm ON "BusinessProfile" USING gin ("searchText" gin_trgm_ops);

-- No double booking of a venue space (or a whole business) for the same date and slot.
CREATE UNIQUE INDEX IF NOT EXISTS availability_unique ON "AvailabilityBlock" ("orgId", "spaceId", "date", "slot") NULLS NOT DISTINCT;

-- A FULL_DAY block conflicts with any slot block for the same org/space/date, and vice versa.
CREATE OR REPLACE FUNCTION check_availability_full_day() RETURNS trigger AS $$
BEGIN
  IF NEW.slot = 'FULL_DAY' THEN
    IF EXISTS (SELECT 1 FROM "AvailabilityBlock"
               WHERE "orgId" = NEW."orgId"
                 AND "spaceId" IS NOT DISTINCT FROM NEW."spaceId"
                 AND "date" = NEW."date"
                 AND "slot" <> 'FULL_DAY'
                 AND id <> NEW.id) THEN
      RAISE EXCEPTION 'FULL_DAY block conflicts with an existing slot block';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM "AvailabilityBlock"
               WHERE "orgId" = NEW."orgId"
                 AND "spaceId" IS NOT DISTINCT FROM NEW."spaceId"
                 AND "date" = NEW."date"
                 AND "slot" = 'FULL_DAY'
                 AND id <> NEW.id) THEN
      RAISE EXCEPTION 'Slot block conflicts with an existing FULL_DAY block';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS availability_full_day_check ON "AvailabilityBlock";
CREATE TRIGGER availability_full_day_check
  BEFORE INSERT OR UPDATE ON "AvailabilityBlock"
  FOR EACH ROW EXECUTE FUNCTION check_availability_full_day();
