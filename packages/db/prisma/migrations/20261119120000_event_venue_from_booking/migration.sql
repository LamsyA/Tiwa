-- D-X100: the venue an event booked is the event's venue. Events that booked a
-- venue before this rule still show the venue typed at creation; point each
-- event day at the active venue booking for that day (or the event's first
-- day when the booking has no date).
UPDATE "EventDay" d
SET "venueName" = CASE WHEN s."name" IS NOT NULL THEN s."name" || ', ' || o."name" ELSE o."name" END
FROM "Booking" b
JOIN "Organization" o ON o."id" = b."vendorOrgId"
LEFT JOIN "VenueSpace" s ON s."id" = b."spaceId"
WHERE b."eventId" = d."eventId"
  AND b."category" = 'venue'
  AND b."status" <> 'CANCELLED'
  AND (
    (b."serviceDate" IS NOT NULL AND d."date" = b."serviceDate"::date)
    OR (
      b."serviceDate" IS NULL
      AND d."id" = (SELECT d2."id" FROM "EventDay" d2 WHERE d2."eventId" = d."eventId" ORDER BY d2."date" ASC LIMIT 1)
    )
  );
